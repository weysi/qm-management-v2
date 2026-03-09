from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from documents.services.handbook_service import list_handbook_file_groups_for_client

from .models import Client
from .serializers import ClientSerializer


class ClientViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """CRUD endpoints for consulting clients."""

    queryset = Client.objects.all()
    serializer_class = ClientSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=["get"], url_path="handbook-files")
    def handbook_files(self, request, pk=None):
        del request
        client = self.get_object()
        return Response(
            {
                "client_id": str(client.id),
                "groups": list_handbook_file_groups_for_client(customer_id=str(client.id)),
            },
            status=status.HTTP_200_OK,
        )
