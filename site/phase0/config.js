// Google project settings for SubQ Character Manager.
// These identify the app to Google and are safe to publish: the client ID
// only works from the authorized origin, and the API key is restricted to
// this site and to the Drive and Picker APIs.

export const CONFIG = {
  clientId: '87080791782-ada93hm3e994eqrge88d0k8bo35ueo02.apps.googleusercontent.com',
  apiKey: 'AIzaSyB9Ty7ZcB9oCx7gSX3L0ADYwQQL-lJh04M',
  appId: '87080791782',
  scopes: {
    file: 'https://www.googleapis.com/auth/drive.file',
    full: 'https://www.googleapis.com/auth/drive',
  },
  modeLabels: {
    file: 'Picked files only (drive.file)',
    full: 'All of Drive (drive)',
  },
  tableFolderName: 'SubQ Table (phase 0 test)',
  pageVersion: 'phase0-1',
};
