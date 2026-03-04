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
    path("handbooks", views.handbooks_view),
    path("handbooks/<str:handbook_id>", views.handbook_detail_view),
    path("handbooks/<str:handbook_id>/upload-zip", views.handbook_upload_zip_view),
    path("handbooks/<str:handbook_id>/tree", views.handbook_tree_view),
    path(
        "handbooks/<str:handbook_id>/files/<str:file_id>/placeholders",
        views.handbook_file_placeholders_view,
    ),
    path(
        "handbooks/<str:handbook_id>/placeholders/save",
        views.handbook_save_placeholders_view,
    ),
    path(
        "handbooks/<str:handbook_id>/placeholders/ai-fill",
        views.handbook_placeholder_ai_fill_view,
    ),
    path("handbooks/<str:handbook_id>/versions", views.handbook_versions_view),
    path(
        "handbooks/<str:handbook_id>/versions/<int:version_number>",
        views.handbook_version_detail_view,
    ),
    path(
        "handbooks/<str:handbook_id>/versions/<int:version_number>/download",
        views.handbook_version_download_view,
    ),
    path("handbooks/<str:handbook_id>/export", views.handbook_export_view),
    path("handbooks/<str:handbook_id>/assets", views.handbook_assets_view),
    path(
        "handbooks/<str:handbook_id>/variables/ai-fill",
        views.handbook_variable_ai_fill_view,
    ),
    path("handbooks/<str:handbook_id>/assets/<str:asset_type>", views.handbook_asset_detail_view),
    path(
        "handbooks/<str:handbook_id>/assets/<str:asset_type>/download",
        views.handbook_asset_download_view,
    ),
]
