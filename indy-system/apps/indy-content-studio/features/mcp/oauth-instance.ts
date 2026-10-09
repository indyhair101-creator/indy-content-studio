import { McpOAuth } from "./oauth";
import { NeonOAuthGrantStore } from "./oauth-store";
import type { OAuthGrantStore } from "./oauth";

// Lazy database access: discovery, bad bearer tokens and login redirects never connect to Neon.
const lazyStore: OAuthGrantStore = {
  saveCode: (...args) => new NeonOAuthGrantStore().saveCode(...args),
  consumeCode: (...args) => new NeonOAuthGrantStore().consumeCode(...args),
  saveRefresh: (...args) => new NeonOAuthGrantStore().saveRefresh(...args),
  rotateRefresh: (...args) => new NeonOAuthGrantStore().rotateRefresh(...args),
  revokeRefresh: (...args) => new NeonOAuthGrantStore().revokeRefresh(...args),
};
export const mcpOAuth = new McpOAuth(lazyStore);
