from django.urls import path

from rag import views


urlpatterns = [
    path("chat", views.chat),
]
