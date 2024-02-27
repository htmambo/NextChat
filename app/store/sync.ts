import { getClientConfig } from "../config/client";
import { Updater } from "../typing";
import { ApiPath, STORAGE_KEY, StoreKey } from "../constant";
import { createPersistStore } from "../utils/store";
import {
  AppState,
  getLocalAppState,
  GetStoreState,
  mergeAppState,
  setLocalAppState,
} from "../utils/sync";
import { downloadAs, readFromFile } from "../utils";
import { showToast } from "../components/ui-lib";
import Locale from "../locales";
import { createSyncClient, ProviderType } from "../utils/cloud";
import { corsPath } from "../utils/cors";

export interface WebDavConfig {
  server: string;
  username: string;
  password: string;
}
// alternative fix for tauri
const isApp = !!getClientConfig()?.isApp;
export type SyncStore = GetStoreState<typeof useSyncStore> & {
  syncing: boolean;
};

const DEFAULT_SYNC_STATE = {
  provider: ProviderType.WebDAV,
  useProxy: true,
  proxyUrl: corsPath(ApiPath.Cors),
  enableAccessControl: false,

  CustomREST: {
    endpoint: "",
    username: STORAGE_KEY,
    token: "",
  },

  webdav: {
    endpoint: "",
    username: "",
    password: "",
  },

  upstash: {
    endpoint: "",
    username: STORAGE_KEY,
    apiKey: "",
  },

  lastSyncTime: 0,
  lastProvider: "",
  lastUpdateTime: 0,
  syncing: false,
  lockclient: false,
};

export const useSyncStore = createPersistStore(
  DEFAULT_SYNC_STATE,
  (set, get) => ({
    cloudSync() {
      const config = get()[get().provider];
      return Object.values(config).every((c) => c.toString().length > 0);
    },

    markSyncTime() {
      set({ lastSyncTime: Date.now(), lastProvider: get().provider });
      set({ lastUpdateTime: Date.now() });
    },

    export() {
      const state = getLocalAppState();
      const datePart = isApp
        ? `${new Date().toLocaleDateString().replace(/\//g, '_')} ${new Date().toLocaleTimeString().replace(/:/g, '_')}`
        : new Date().toLocaleString();

      const fileName = `Backup-${datePart}.json`;
      downloadAs(JSON.stringify(state), fileName);
    },

    async import() {
      const rawContent = await readFromFile();

      try {
        const remoteState = JSON.parse(rawContent) as AppState;
        const localState = getLocalAppState();
        mergeAppState(localState, remoteState);
        setLocalAppState(localState);
        location.reload();
      } catch (e) {
        console.error("[Import]", e);
        showToast(Locale.Settings.Sync.ImportFailed);
      }
    },

    getClient() {
      const provider = get().provider;
      const client = createSyncClient(provider, get());
      return client;
    },

    async sync() {
      if (get().syncing) {
        return false;
      }

      const localState = getLocalAppState();
      const provider = get().provider;
      const config = get()[provider];
      const client = this.getClient();

      try {
        set({ syncing: true }); // Set syncing to true before performing the sync
        const tmpRemoteState = JSON.parse(
          await client.get(config.username),
        ) as AppState;
        // 替换remoteState中的access-control、app-config为localState中的值
        const remoteState = { ...tmpRemoteState };
        if (get().lockclient) {
          // 如果lockclient为true，不同步access-control、app-config。需要生成一个新的用于合并的变量，因为remoteState是只读的
          remoteState[StoreKey.Access] = localState[StoreKey.Access];
          remoteState[StoreKey.Config] = localState[StoreKey.Config];
        }
        mergeAppState(localState, remoteState);
        const sessions = localState[StoreKey.Chat].sessions;
        const currentSession =
          sessions[localState[StoreKey.Chat].currentSessionIndex];
        const filteredTopic =
          currentSession.topic === "New Conversation" &&
          currentSession.messages.length === 0;

        if (filteredTopic) {
          const remoteSessions = remoteState[StoreKey.Chat].sessions;
          const remoteCurrentSession =
            remoteSessions[remoteState[StoreKey.Chat].currentSessionIndex];
          const remoteFilteredTopic =
            remoteCurrentSession.topic === "New Conversation" &&
            remoteCurrentSession.messages.length > 0;

          if (!remoteFilteredTopic) {
            localState[StoreKey.Chat].sessions[
              localState[StoreKey.Chat].currentSessionIndex
            ].mask = {
              ...currentSession.mask,
              name: remoteCurrentSession.mask.name,
            };
          }
        }

        setLocalAppState(localState);
      } catch (e) {
        console.log("[Sync] failed to get remote state", e);

      }

      await client.set(config.username, JSON.stringify(localState));

      this.markSyncTime();
      set({ syncing: false });

      return true; // Add the return statement here
    },

    async check() {
      const client = this.getClient();
      return await client.check();
    },
  }),
  {
    name: StoreKey.Sync,
    version: 1.1,

    migrate(persistedState, version) {
      const newState = persistedState as typeof DEFAULT_SYNC_STATE;

      if (version < 1.1) {
        newState.upstash.username = STORAGE_KEY;
      }

      return newState as any;
    },
  },
);
