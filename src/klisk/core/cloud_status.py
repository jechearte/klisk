"""Query Google Cloud Run deployment status."""

from __future__ import annotations

import re
import subprocess


def _slugify(name: str) -> str:
    """Convert a project name to a valid Cloud Run service name."""
    slug = re.sub(r"[^a-z0-9-]", "-", name.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "klisk-agent"


def get_cloud_run_url(
    service_name: str,
    gcp_project: str,
    region: str = "",
) -> dict:
    """Query the deployed URL for a Cloud Run service.

    Returns dict with: deployed, url, service_name, message
    """
    if not service_name or not gcp_project:
        return {
            "deployed": False,
            "url": None,
            "service_name": service_name or "",
            "message": "GCP project or service name not configured",
        }

    cmd = [
        "gcloud", "run", "services", "describe", service_name,
        "--format", "value(status.url)",
        "--project", gcp_project,
    ]
    if region:
        cmd.extend(["--region", region])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        url = result.stdout.strip()

        if result.returncode == 0 and url:
            return {
                "deployed": True,
                "url": url,
                "service_name": service_name,
                "message": "Service is deployed",
            }

        # Service not found or other error
        stderr = result.stderr.strip()
        if "could not be found" in stderr.lower() or "not found" in stderr.lower():
            return {
                "deployed": False,
                "url": None,
                "service_name": service_name,
                "message": "Service not deployed yet",
            }

        return {
            "deployed": False,
            "url": None,
            "service_name": service_name,
            "message": stderr or "Could not check deployment status",
        }

    except FileNotFoundError:
        return {
            "deployed": False,
            "url": None,
            "service_name": service_name,
            "message": "gcloud CLI not found. Install it from https://cloud.google.com/sdk",
        }
    except subprocess.TimeoutExpired:
        return {
            "deployed": False,
            "url": None,
            "service_name": service_name,
            "message": "Timed out checking deployment status",
        }
