from django.urls import path

from generation import views


urlpatterns = [
    path("manuals/<str:manual_id>/start-package", views.start_package),
    path("manuals/<str:manual_id>/ingest", views.ingest_manual),
    path("manuals/<str:manual_id>/plan", views.plan_manual),
    path("manuals/<str:manual_id>/generate", views.generate_manual),
]
