"""UFFIS Forecasts: the forecast viewer on the uffis.org apex."""

from tethys_sdk.base import TethysAppBase


class App(TethysAppBase):
    """Apex-only app. Hidden from every app library."""

    name = "UFFIS Forecasts"
    description = "Hourly EF5 flash flood and impact based forecasts."
    package = "uffis_forecasts"
    index = "home"
    icon = f"{package}/images/icon.png"
    root_url = "uffis-forecasts"
    color = "#19488b"
    tags = ""
    enable_feedback = False
    feedback_emails = []
    show_in_apps_library = False
