from django.contrib import admin

from .models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("name", "industry", "ceo", "employee_count", "created_at")
    search_fields = ("name", "ceo", "industry")
    readonly_fields = ("id", "created_at", "updated_at")
