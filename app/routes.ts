import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("vault", "routes/vault.tsx"),
	route("vault/signin", "routes/vault-signin.tsx"),
] satisfies RouteConfig;
