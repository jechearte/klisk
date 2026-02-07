"""AST-based source file editor for modifying agent and tool definitions."""

from __future__ import annotations

import ast
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def update_agent_in_source(
    source_file: str,
    agent_name: str,
    updates: dict,
) -> None:
    """Modify a define_agent() call in a Python source file using AST positions.

    Supported update keys: name, instructions, model, temperature.
    """
    path = Path(source_file)
    if not path.exists():
        raise FileNotFoundError(f"Source file not found: {source_file}")

    source = path.read_text()
    tree = ast.parse(source)
    lines = source.splitlines(keepends=True)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not _is_define_agent_call(node):
            continue

        # Confirm this is the right agent by checking the name kwarg
        name_kw = _find_keyword(node, "name")
        if name_kw is None or not isinstance(name_kw.value, ast.Constant):
            continue
        if name_kw.value.value != agent_name:
            continue

        logger.info("Found agent '%s' in %s", agent_name, source_file)

        # Separate existing-field replacements from new-field additions
        replacements: list[tuple[int, int, int, int, str]] = []
        new_fields: list[tuple[str, object]] = []

        for key, value in updates.items():
            if key == "tools":
                continue

            kw = _find_keyword(node, key)
            if kw is not None and kw.value is not None:
                val = kw.value
                new_text = _value_to_source(value)
                replacements.append((
                    val.lineno - 1,
                    val.col_offset,
                    val.end_lineno - 1,
                    val.end_col_offset,
                    new_text,
                ))
            else:
                new_fields.append((key, value))

        # 1) Apply in-place replacements in reverse order to preserve positions
        replacements.sort(key=lambda r: (r[0], r[1]), reverse=True)
        for start_line, start_col, end_line, end_col, new_text in replacements:
            if start_line == end_line:
                line = lines[start_line]
                lines[start_line] = line[:start_col] + new_text + line[end_col:]
            else:
                first_line = lines[start_line]
                last_line = lines[end_line]
                lines[start_line] = first_line[:start_col] + new_text + last_line[end_col:]
                del lines[start_line + 1 : end_line + 1]

        # 2) Add new keyword arguments before closing paren
        if new_fields:
            # Re-parse to get updated positions after replacements
            updated_source = "".join(lines)
            updated_tree = ast.parse(updated_source)
            lines = updated_source.splitlines(keepends=True)

            for unode in ast.walk(updated_tree):
                if not isinstance(unode, ast.Call):
                    continue
                if not _is_define_agent_call(unode):
                    continue
                # Insert all new fields before the closing ")"
                indent = _detect_kwarg_indent(unode, lines)
                insert_line = unode.end_lineno - 1
                for key, value in reversed(new_fields):
                    new_text = _value_to_source(value)
                    insert_text = f"{indent}{key}={new_text},\n"
                    lines.insert(insert_line, insert_text)
                break

        path.write_text("".join(lines))
        logger.info("Updated agent '%s': %s", agent_name, list(updates.keys()))
        return

    raise ValueError(f"Could not find define_agent() call for agent '{agent_name}' in {source_file}")


def update_tool_in_source(
    source_file: str,
    tool_name: str,
    updates: dict,
) -> None:
    """Modify a @tool-decorated function in a Python source file.

    Supported update keys: name (renames function), description (changes docstring).
    """
    path = Path(source_file)
    if not path.exists():
        raise FileNotFoundError(f"Source file not found: {source_file}")

    source = path.read_text()
    tree = ast.parse(source)
    lines = source.splitlines(keepends=True)

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name != tool_name:
            continue

        replacements: list[tuple[int, int, int, int, str]] = []

        # Update function name
        if "name" in updates and updates["name"] != tool_name:
            new_name = updates["name"]
            def_line_idx = node.lineno - 1
            def_line = lines[def_line_idx]
            prefix = "async def " if isinstance(node, ast.AsyncFunctionDef) else "def "
            name_start = def_line.index(prefix) + len(prefix)
            name_end = name_start + len(tool_name)
            replacements.append((def_line_idx, name_start, def_line_idx, name_end, new_name))

        # Update docstring
        if "description" in updates and node.body:
            first_stmt = node.body[0]
            if isinstance(first_stmt, ast.Expr) and isinstance(first_stmt.value, ast.Constant):
                val = first_stmt.value
                new_doc = f'"""{updates["description"]}"""'
                replacements.append((
                    val.lineno - 1,
                    val.col_offset,
                    val.end_lineno - 1,
                    val.end_col_offset,
                    new_doc,
                ))

        # Apply in reverse order
        replacements.sort(key=lambda r: (r[0], r[1]), reverse=True)
        for start_line, start_col, end_line, end_col, new_text in replacements:
            if start_line == end_line:
                line = lines[start_line]
                lines[start_line] = line[:start_col] + new_text + line[end_col:]
            else:
                first_line = lines[start_line]
                last_line = lines[end_line]
                lines[start_line] = first_line[:start_col] + new_text + last_line[end_col:]
                del lines[start_line + 1 : end_line + 1]

        path.write_text("".join(lines))
        logger.info("Updated tool '%s': %s", tool_name, list(updates.keys()))
        return

    raise ValueError(f"Could not find function '{tool_name}' in {source_file}")


def rename_tool_references(
    project_dir: str | Path,
    old_name: str,
    new_name: str,
) -> None:
    """Update get_tools() calls across the project when a tool is renamed."""
    project_dir = Path(project_dir).resolve()

    for py_file in project_dir.rglob("*.py"):
        if any(part.startswith(".") or part in ("__pycache__", "node_modules", ".venv") for part in py_file.parts):
            continue

        source = py_file.read_text()
        if "get_tools" not in source:
            continue

        tree = ast.parse(source)
        lines = source.splitlines(keepends=True)
        changed = False

        string_replacements: list[tuple[int, int, int, int, str]] = []

        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not (isinstance(func, ast.Name) and func.id == "get_tools"):
                continue

            for arg in node.args:
                if isinstance(arg, ast.Constant) and arg.value == old_name:
                    new_text = repr(new_name)
                    string_replacements.append((
                        arg.lineno - 1,
                        arg.col_offset,
                        arg.end_lineno - 1,
                        arg.end_col_offset,
                        new_text,
                    ))
                    changed = True

        if changed:
            string_replacements.sort(key=lambda r: (r[0], r[1]), reverse=True)
            for sl, sc, el, ec, nt in string_replacements:
                if sl == el:
                    line = lines[sl]
                    lines[sl] = line[:sc] + nt + line[ec:]
                else:
                    first = lines[sl]
                    last = lines[el]
                    lines[sl] = first[:sc] + nt + last[ec:]
                    del lines[sl + 1 : el + 1]

            py_file.write_text("".join(lines))


def get_function_source(source_file: str, func_name: str) -> str:
    """Extract the full source code of a decorated function from a Python file."""
    path = Path(source_file)
    if not path.exists():
        return ""

    source = path.read_text()
    tree = ast.parse(source)
    lines = source.splitlines(keepends=True)

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name != func_name:
            continue

        # Include decorator lines
        start = node.lineno - 1
        if node.decorator_list:
            start = node.decorator_list[0].lineno - 1
        end = node.end_lineno

        return "".join(lines[start:end])

    return ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_define_agent_call(node: ast.Call) -> bool:
    func = node.func
    if isinstance(func, ast.Name) and func.id == "define_agent":
        return True
    if isinstance(func, ast.Attribute) and func.attr == "define_agent":
        return True
    return False


def _find_keyword(node: ast.Call, name: str) -> ast.keyword | None:
    for kw in node.keywords:
        if kw.arg == name:
            return kw
    return None


def _value_to_source(value: object) -> str:
    """Convert a Python value to its source representation."""
    if isinstance(value, str):
        return repr(value)
    if isinstance(value, float):
        return str(value)
    if isinstance(value, int):
        return str(value)
    if value is None:
        return "None"
    return repr(value)


def _detect_kwarg_indent(node: ast.Call, lines: list[str]) -> str:
    """Detect the indentation used for keyword arguments in a call."""
    for kw in node.keywords:
        if kw.arg is not None:
            line = lines[kw.value.lineno - 1]
            stripped = line.lstrip()
            indent = line[: len(line) - len(stripped)]
            return indent
    return "    "
