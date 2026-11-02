import 'dotenv/config'
import { app } from './app.js'

const PORT = Number(process.env.PORT) || 3333

app
  .listen({
    port: PORT,
    host: '0.0.0.0',
  })
  .then(() => {
    console.log(`🚀 Hintlink HTTP Server running on http://localhost:${PORT}`)
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
