import { STORAGE_KEY, REPO_URL } from "@/app/constant";
import { chunks } from "../format";
import { SyncStore } from "@/app/store/sync";

export type CustomRESTClient = ReturnType<typeof createCustomRESTClient>;

export function createCustomRESTClient(store: SyncStore) {
  const config = store.CustomREST;
  const storeKey = config.username.length === 0 ? STORAGE_KEY : config.username;
  // a proxy disable for a tmp since github doesn't need proxy url
  const proxyUrl =
    store.useProxy && store.proxyUrl.length > 0 ? store.proxyUrl : undefined;

  return {
    async check() {
      try {
        const res = await fetch(this.path("get", storeKey), {
          method: "GET",
          headers: this.headers(),
          //proxyUrl,
          mode: "cors",
        });

        console.log("[CustomREST] check", res.status, res.statusText);
        if (res.status === 200) {
          return [200].includes(res.status);
        } else {
          return false;
        }
      } catch (e) {
        console.error("[CustomREST] failed to check", e);
      }
      return false;
    },

    async get() {
      const res = await fetch(this.path("get", storeKey), {
        method: "GET",
        headers: this.headers(),
        //proxyUrl,
        mode: "cors",
      });

      console.log(
        "[CustomREST] get key = ",
        storeKey,
        res.status,
        res.statusText,
      );
      let resJson = {result: ""};
      if (res.status === 200) {
        resJson = (await res.json()) as { result: string };

      }
      return resJson.result;
    },

    async set(_: string, value: string) {
      return fetch(this.path("set", storeKey), {
        method: "POST",
        headers: this.headers(),
        body: value,
        //proxyUrl,
        mode: "cors",
      })
        .then((res) => {
          console.log(
            "[CustomREST] set key = ",
            storeKey,
            res.status,
            res.statusText,
          );
          return value;
        })
        .catch((error) => {
          console.error(
            "[CustomREST] set key = ",
            storeKey,
            error,
          );
          return "";
        });
    },

    headers() {
      return {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      };
    },

    path(method: string, path: string) {
      let url = config.endpoint;

      if (!url.endsWith("/")) {
        url += "/";
      }

      if (path.startsWith("/")) {
        path = path.slice(1);
      }

      return url + method + "/" + path;
    },
  };
}
