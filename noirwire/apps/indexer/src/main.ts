import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.PORT || 8081;
  await app.listen(port);

  console.log(`🔍 NoirWire Indexer running on http://localhost:${port}`);
}

bootstrap();
