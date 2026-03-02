from django.urls import path

from assets import views


urlpatterns = [
    path("assets/local-upload", views.local_upload),
    path("assets/presign-upload", views.presign_upload_stub),
    path("assets/presign-download", views.presign_download_stub),
    path("assets/<uuid:asset_id>/binary", views.get_asset_binary),
    path("handbooks/<str:handbook_id>/assets", views.list_handbook_assets),
    path("handbooks/<str:handbook_id>/outputs/download", views.download_handbook_outputs),
]
