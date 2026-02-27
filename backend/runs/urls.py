from django.urls import path

from runs import views


urlpatterns = [
    path("manuals/<str:manual_id>/runs/<uuid:run_id>", views.get_run),
]
