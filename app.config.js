// Todo vive en app.json. Este archivo existía para inyectar la llave de Google Maps
// Android desde .env; se retiró porque hacía la config no determinista y, con
// runtimeVersion de política fingerprint, eso producía runtimeVersions distintos
// según el entorno de build (ver KIN-122). La llave viaja igual dentro del APK;
// su protección real son las restricciones de aplicación en Google Cloud Console.
//
// La llave web de Places/Geocoding (EXPO_PUBLIC_GOOGLE_PLACES_API_KEY) sigue
// viniendo de .env: Expo la inlinea en el bundle JS y el cliente la lee por
// process.env. No entra aquí.
//
// iOS usa Apple Maps (no necesita llave). Ver .env.example.
const appJson = require("./app.json");
module.exports = () => appJson.expo;
