from django.urls import path

from runs import views


urlpatterns = [
    path("handbooks/<str:handbook_id>/runs/<uuid:run_id>", views.get_run),
]
