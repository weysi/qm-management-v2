from django.urls import include, path

urlpatterns = [
    path("", include("assets.urls")),
    path("", include("generation.urls")),
    path("", include("rag.urls")),
    path("", include("runs.urls")),
]
