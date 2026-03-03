from django.contrib import admin

from .models import Document, DocumentVariable, DocumentVersion, RewriteAudit, WorkspaceAsset


admin.site.register(Document)
admin.site.register(DocumentVariable)
admin.site.register(DocumentVersion)
admin.site.register(WorkspaceAsset)
admin.site.register(RewriteAudit)
