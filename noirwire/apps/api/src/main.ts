import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  });

  const port = process.env.PORT || 8080;
  await app.listen(port);

  console.log(`🚀 NoirWire API running on http://localhost:${port}`);
}

bootstrap();
