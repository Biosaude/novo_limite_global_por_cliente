import { createConnectivityHandler } from "../../server/diagnostics/neon-connectivity.js";
/** Somente operadores com chave temporária no Preview/Development. Não é health check público. */
export default createConnectivityHandler();
