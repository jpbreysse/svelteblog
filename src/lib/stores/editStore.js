import { writable } from 'svelte/store';

// Store to pass post data from Explorer to Blog for editing
export const postToEdit = writable(null);
