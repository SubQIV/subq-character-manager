// Thin wrapper over the Google Drive REST API (v3). Every call goes through
// the `api` function supplied by the app, which adds the access token and
// records the result for the test report.

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ALL_DRIVES = 'supportsAllDrives=true';
export const FOLDER_TYPE = 'application/vnd.google-apps.folder';

const jsonHeaders = { 'Content-Type': 'application/json' };

export function makeDrive(api) {
  return {
    async about() {
      const res = await api('about', `${BASE}/about?fields=user(displayName,emailAddress)`);
      return (await res.json()).user;
    },

    async createFolder(name, parentId) {
      const body = { name, mimeType: FOLDER_TYPE };
      if (parentId) body.parents = [parentId];
      const res = await api('create folder', `${BASE}/files?${ALL_DRIVES}&fields=id,name,mimeType`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      return res.json();
    },

    async createJson(name, parentId, content) {
      const boundary = `subq${Math.random().toString(36).slice(2)}`;
      const metadata = { name, mimeType: 'application/json', parents: [parentId] };
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        `${JSON.stringify(content, null, 2)}\r\n` +
        `--${boundary}--`;
      const res = await api(
        'create file',
        `${UPLOAD}/files?uploadType=multipart&${ALL_DRIVES}&fields=id,name,mimeType`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      return res.json();
    },

    async list(folderId) {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const fields = encodeURIComponent(
        'files(id,name,mimeType,modifiedTime,owners(emailAddress),capabilities(canEdit))',
      );
      const res = await api(
        'list folder',
        `${BASE}/files?q=${q}&fields=${fields}&pageSize=200&${ALL_DRIVES}&includeItemsFromAllDrives=true`,
      );
      return (await res.json()).files || [];
    },

    async meta(fileId) {
      const fields = encodeURIComponent(
        'id,name,mimeType,modifiedTime,owners(emailAddress),capabilities(canEdit)',
      );
      const res = await api('read details', `${BASE}/files/${fileId}?fields=${fields}&${ALL_DRIVES}`);
      return res.json();
    },

    async readJson(fileId) {
      const res = await api('read file', `${BASE}/files/${fileId}?alt=media&${ALL_DRIVES}`);
      return res.json();
    },

    async writeJson(fileId, content) {
      await api('write file', `${UPLOAD}/files/${fileId}?uploadType=media&${ALL_DRIVES}&fields=id`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(content, null, 2),
      });
    },

    async share(fileId, email) {
      await api('share folder', `${BASE}/files/${fileId}/permissions?${ALL_DRIVES}&sendNotificationEmail=true`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }),
      });
    },
  };
}
