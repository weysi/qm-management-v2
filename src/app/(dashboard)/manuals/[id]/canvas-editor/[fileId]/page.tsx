export default async function CanvasEditorRoute() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-amber-900">
          Canvas-Editor vorübergehend deaktiviert
        </h1>
        <p className="mt-2 text-sm text-amber-800">
          Während des lokalen Django-RAG-Cutovers ist die DOCX-Canvas-Bearbeitung
          eingefroren. Upload, Generierung und Download laufen über die neue
          Backend-Pipeline.
        </p>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
