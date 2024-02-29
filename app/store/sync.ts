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
import { createSyncClient, ProviderType, SyncClient } from "../utils/cloud";
import { corsPath } from "../utils/cors";

export interface WebDavConfig {
  endpoint: string;
  username: string;
  password: string;
  filename: string;
}

export interface GistConfig {
  filename: string;
  gistId: string;
  token: string;
}

export type SyncStore = GetStoreState<typeof useSyncStore> & {
  syncing: boolean;
};

const DEFAULT_SYNC_STATE = {
  provider: ProviderType.WebDAV,
  useProxy: true,
  proxyUrl: corsPath(ApiPath.Cors),

  CustomREST: {
    endpoint: "",
    filename: STORAGE_KEY,
    token: "",
  },

  githubGist: {
    filename: "",
    gistId: "",
    token: "",
  },

  webdav: {
    endpoint: "",
    username: "",
    password: "",
    filename: "",
  },

  upstash: {
    endpoint: "",
    username: STORAGE_KEY,
    apiKey: "",
    filename: STORAGE_KEY,
  },

  gosync: {
    filename: "",
    username: STORAGE_KEY,
    token: "",
  },

  lastSyncTime: 0,
  lastProvider: "",
  lastUpdateTime: 0,
  syncing: false,
  // 放弃远程数据，以本地数据完全覆盖远程
  enableOverwriteRemote: false,
  // 放弃本地数据，以远程数据完全覆盖本地
  enableOverwriteLocal: false,
  // 仅同步用户数据（聊天、自定义面具以及提示）
  onlysyncuserdata: true,
};
// alternative fix for tauri
const isApp = !!getClientConfig()?.isApp;

export const useSyncStore = createPersistStore(
  DEFAULT_SYNC_STATE,
  (set, get) => ({
    cloudSync() {
      const config = get()[get().provider] as Record<string, any>;
      console.log('driver', get().provider);
      console.log('config', config);
      let allValuesFilled = true;
      for (let key in config) {
        if (key != 'username' && config[key].toString().length === 0) {
            console.log(`Key '${key}' 的值为空`);
            allValuesFilled = false;
        }
      }
      return allValuesFilled;
    },

    markSyncTime(provider: ProviderType) {
      set({ lastSyncTime: Date.now(), lastProvider: provider });
    },

    markUpdateTime() {
      set({ lastUpdateTime: Date.now() });
    },

    export() {
      const state = getLocalAppState();
      const datePart = isApp
        ? `${new Date().toLocaleDateString().replace(/\//g, '_')} ${new Date().toLocaleTimeString().replace(/:/g, '_')}`
        : new Date().toLocaleString();

      const fileName = `Backup-${datePart}.json`;
      downloadAs((state), fileName);
    },

    async import() {
      const rawContent = await readFromFile();

      try {
        const jsonChunks = rawContent.split("\n");
        const localState = getLocalAppState();

        for (const jsonChunk of jsonChunks) {
          const remoteState = JSON.parse(jsonChunk) as AppState;
          mergeAppState(localState, remoteState);
        }

        setLocalAppState(localState);
        location.reload();
      } catch (e) {
        console.error("[Import] Failed to import JSON file:", e);
        showToast(Locale.Settings.Sync.ImportFailed);
      }
    },

    getClient(provider: ProviderType): SyncClient<ProviderType> {
      const client = createSyncClient(provider, get());
      return client;
    },

    async sync(overwriteAccessControl: boolean = false) {
      if (get().syncing) {
        return false;
      }

      const localState = getLocalAppState();
      const provider = get().provider;
      const config = get()[provider];
      const client = this.getClient(provider);

      try {
        set({ syncing: true }); // Set syncing to true before performing the sync
        // 除了基本的双向同步以外，还需要实现以下的同步方式
        // 1. 覆盖远程所有数据
        // 2. 覆盖本地所有数据
        // 3. 仅同步用户数据（聊天、自定义面具以及提示）

        // 1. 覆盖远程所有数据（这时不需要从远程下载）
        if (get().enableOverwriteRemote) {
        } else {
          const tmpRemoteState = JSON.parse(
            await client.get(config.filename),
          ) as AppState;
          // 3. 仅同步用户数据（替换remoteState中的access-control、app-config为localState中的值）
          const remoteState = { ...tmpRemoteState };
          if (get().onlysyncuserdata) {
            // 如果onlysyncuserdata为true，不同步access-control、app-config。需要生成一个新的用于合并的变量，因为remoteState是只读的
            remoteState[StoreKey.Access] = localState[StoreKey.Access];
            remoteState[StoreKey.Config] = localState[StoreKey.Config];
          }
          // 2. 覆盖本地所有数据（这时不需要上传到远程，覆盖完直接返回）
          if (get().enableOverwriteLocal) {
            setLocalAppState(tmpRemoteState);
            this.markSyncTime(provider);
            set({ syncing: false });
            return true; // Add the return statement here
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
        }
      } catch (e) {
        console.log("[Sync] failed to get remote state", e);
      }

      if (provider === ProviderType.CustomREST) {
        await client.set(config.filename, JSON.stringify(localState));
      } else if (provider === ProviderType.WebDAV) {
        await this.syncWebDAV(client, config.filename, localState);
      } else if (provider === ProviderType.GitHubGist) {
        await this.syncGitHubGist(client, config.filename, localState);
      }

      this.markSyncTime(provider);
      this.markUpdateTime(); // Call markUpdateTime to update lastUpdateTime
      set({ syncing: false });

      return true; // Add the return statement here
    },

    async syncWebDAV(client: SyncClient<ProviderType.WebDAV>, value: string, localState: AppState) {
      await client.set(value, JSON.stringify(localState));
    },

    async syncGitHubGist(client: SyncClient<ProviderType.GitHubGist>, value: GistConfig | string, localState: AppState | Object) {
      if (typeof value === 'string') {
        await client.set(localState as string, value);
      } else {
        await client.set(localState as string, value.filename);
      }
    },

    async check() {
      const client = this.getClient(get().provider);
      return await client.check();
    },
  }),
  {
    name: StoreKey.Sync,
    version: 1.2, // golang syncing 
    migrate(persistedState, version) {
      const newState = persistedState as typeof DEFAULT_SYNC_STATE;
      if (version < 1.1) {
        newState.upstash.username = STORAGE_KEY;
      }
      if (version < 1.2) {
        newState.gosync.username = STORAGE_KEY;
      }
      return newState as any;
    },
  },
);
