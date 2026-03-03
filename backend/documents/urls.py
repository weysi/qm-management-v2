from django.urls import path

from . import views


urlpatterns = [
    path("documents/upload", views.upload_document_view),
    path("documents", views.list_documents_view),
    path("documents/<uuid:document_id>", views.document_detail_view),
    path("documents/<uuid:document_id>/render", views.render_document_view),
    path("documents/<uuid:document_id>/ai-rewrite", views.rewrite_document_view),
    path("documents/<uuid:document_id>/download", views.download_document_view),
    path("files/tree", views.files_tree_view),
    path("files", views.files_delete_view),
    path("handbooks/<str:handbook_id>/assets", views.handbook_assets_view),
    path("handbooks/<str:handbook_id>/assets/<str:asset_type>", views.handbook_asset_detail_view),
    path(
        "handbooks/<str:handbook_id>/assets/<str:asset_type>/download",
        views.handbook_asset_download_view,
    ),
]
