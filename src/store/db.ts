// On-device storage in IndexedDB. If the browser refuses storage (some
// private windows), the app keeps working in memory and says so.

import { openDB, type IDBPDatabase } from 'idb';
import type { CharacterDoc } from '../model/changes';

const DB_NAME = 'subq-character-manager';

interface Schema {
  characters: { key: string; value: CharacterDoc };
  images: { key: string; value: Blob };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore('characters', { keyPath: 'id' });
        database.createObjectStore('images');
      },
    });
  }
  return dbPromise;
}

export async function loadCharacters(): Promise<CharacterDoc[]> {
  return (await db()).getAll('characters');
}

export async function saveCharacter(doc: CharacterDoc): Promise<void> {
  await (await db()).put('characters', doc);
}

export async function deleteCharacter(id: string): Promise<void> {
  await (await db()).delete('characters', id);
}

export async function saveImage(key: string, blob: Blob): Promise<void> {
  await (await db()).put('images', blob, key);
}

export async function loadImage(key: string): Promise<Blob | undefined> {
  return (await db()).get('images', key);
}

export async function deleteImage(key: string): Promise<void> {
  await (await db()).delete('images', key);
}

/** Ask the browser not to clear this app's storage when space runs low. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
