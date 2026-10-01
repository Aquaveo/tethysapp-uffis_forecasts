"""The one page of the app."""

from django.conf import settings
from django.shortcuts import render
from tethys_sdk.routing import controller

DEFAULT_OUTPUTS_BASE = "https://tito.uffis.org/outputs"


def outputs_base():
    """Return the outputs URL the viewer reads from."""
    return getattr(settings, "UFFIS_OUTPUTS_BASE", DEFAULT_OUTPUTS_BASE).rstrip("/")


@controller(login_required=False)
def home(request):
    """Render the forecast viewer for anonymous visitors."""
    return render(request, "uffis_forecasts/home.html", {"outputs_base": outputs_base()})
