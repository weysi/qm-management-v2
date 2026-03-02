from django.urls import path

from generation import views


urlpatterns = [
    path("handbooks/<str:handbook_id>/start-package", views.start_package),
    path("handbooks/<str:handbook_id>/ingest", views.ingest_handbook),
    path("handbooks/<str:handbook_id>/plan", views.plan_handbook),
    path("handbooks/<str:handbook_id>/generate", views.generate_handbook),
]
