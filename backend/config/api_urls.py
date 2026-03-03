from django.urls import include, path

urlpatterns = [
    path("", include("clients.urls")),
    path("", include("documents.urls")),
]
