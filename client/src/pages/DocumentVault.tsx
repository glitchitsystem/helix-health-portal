/**
 * DocumentVault — list and upload patient documents.
 *
 * Routes:
 *   /patients/:patientId/documents  (provider/staff view for specific patient)
 *   /documents                      (patient sees own documents)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ApiSuccess, AuthMeData, Document } from '../types';

const DocumentVault: React.FC = () => {
  const { patientId: paramPatientId } = useParams<{ patientId?: string }>();
  const { user } = useAuth();

  const [patientId, setPatientId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStaff = user?.roles.some(r => ['provider', 'nurse', 'admin'].includes(r));

  // Resolve patientId
  useEffect(() => {
    if (paramPatientId) {
      setPatientId(Number(paramPatientId));
      setLoading(false);
      return;
    }

    api.get<ApiSuccess<AuthMeData>>('/auth/me')
      .then((r) => {
        const resolvedPatientId = r.data.data.patient_id ?? r.data.data.patient?.id ?? null;
        if (resolvedPatientId === null) {
          setError('Could not determine patient record.');
          return;
        }
        setPatientId(resolvedPatientId);
      })
      .catch(() => setError('Could not determine patient record.'));
  }, [paramPatientId]);

  // Fetch documents once patientId is known
  useEffect(() => {
    if (!patientId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.get<{ data: Document[] }>(`/patients/${patientId}/documents`)
      .then(r => setDocuments(r.data.data))
      .catch(() => setError('Failed to load documents.'))
      .finally(() => setLoading(false));
  }, [patientId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !patientId) return;
    setUploading(true);
    setUploadError('');

    const form = new FormData();
    form.append('file', file);
    form.append('description', description);

    try {
      await api.post(`/patients/${patientId}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Refresh list
      const r = await api.get<{ data: Document[] }>(`/patients/${patientId}/documents`);
      setDocuments(r.data.data);
      setShowUpload(false);
      setFile(null);
      setDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setUploadError(err?.response?.data?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const resp = await api.get(`/documents/doc/${doc.id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed.');
    }
  };

  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Document Vault</h1>
        {isStaff && (
          <button
            onClick={() => setShowUpload(v => !v)}
            className="rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700"
          >
            {showUpload ? '✕ Cancel' : '+ Upload Document'}
          </button>
        )}
      </div>

      {/* Upload form */}
      {showUpload && (
        <form
          onSubmit={handleUpload}
          className="mb-6 rounded-xl bg-helix-50 p-5 ring-1 ring-helix-200"
        >
          <h2 className="mb-4 text-sm font-semibold text-helix-800">Upload New Document</h2>
          {uploadError && (
            <p className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{uploadError}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">File *</label>
              <input
                ref={fileInputRef}
                type="file"
                required
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-helix-500"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
              />
              <p className="mt-1 text-xs text-gray-400">PDF, JPG, PNG, DOC, TXT</p>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. HbA1c panel from 2025-06"
                className="block w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-helix-500"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={uploading || !file}
              className="rounded-lg bg-helix-600 px-5 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl bg-gray-50 py-16 text-center">
          <div className="text-4xl">📁</div>
          <p className="mt-2 text-gray-500">No documents on file.</p>
          {isStaff && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-4 rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700"
            >
              Upload First Document
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['File', 'Type', 'Description', 'Uploaded', 'Size', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileIcon mime={doc.file_type} />
                      <span className="font-medium text-gray-800 truncate max-w-xs">{doc.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {doc.file_type}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {doc.description ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {formatBytes(doc.file_size)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="rounded-lg px-3 py-1 text-xs font-medium text-helix-600 ring-1 ring-helix-200 hover:bg-helix-50"
                    >
                      ⬇ Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const FileIcon: React.FC<{ mime: string }> = ({ mime }) => {
  if (mime.startsWith('image/')) return <span>🖼️</span>;
  if (mime === 'application/pdf') return <span>📄</span>;
  if (mime.includes('word')) return <span>📝</span>;
  return <span>📎</span>;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default DocumentVault;
