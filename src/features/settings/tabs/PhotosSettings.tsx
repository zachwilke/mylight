import { Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Card, CardContent } from "../../../components/ui";
import { apiFetch } from "../../../lib/api";
import { Photo } from "../../../types";

export function PhotosSettings() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  useEffect(() => {
    fetchPhotos();
  }, []);

  const fetchPhotos = () => {
    apiFetch("/api/photos")
      .then((res) => res.json())
      .then((data) => setPhotos(data || []))
      .catch(console.error);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append("photos", file);
    });

    try {
      await apiFetch("/api/photos", {
        method: "POST",
        body: formData,
      });
      fetchPhotos();
      e.target.value = "";
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await apiFetch(`/api/photos/${pendingDeleteId}`, { method: "DELETE" });
      setPhotos(photos.filter((p) => p.id !== pendingDeleteId));
      setPendingDeleteId(null);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = (id: number) => {
    setPendingDeleteId(id);
    setShowDeleteConfirm(true);
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Remove Photo"
        message="Are you sure you want to remove this photo?"
        confirmText="Remove"
      />

      <Card>
        <CardContent>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Screensaver Photos
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Upload photos to display during screensaver mode.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {/* Upload Button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center text-gray-400 hover:border-primary-500 hover:text-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-900/20 cursor-pointer transition-all"
            >
              <Upload size={24} />
              <span className="text-xs font-semibold mt-2">Upload</span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleUpload}
              />
            </div>

            {/* Photo Grid */}
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <img
                  src={photo.url}
                  alt="Screensaver"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onClick={() => handleDelete(photo.id)}
                    className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50 transition-colors shadow-sm"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
