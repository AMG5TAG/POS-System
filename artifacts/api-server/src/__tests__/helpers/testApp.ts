import express, { type Express } from "express";
import session from "express-session";
import "../../../src/lib/auth"; // loads session type augmentation

export function createTestApp(): Express {
  const app = express();

  app.use(express.json());

  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );

  app.use((req, _res, next) => {
    req.session.merchantId = 1;
    next();
  });

  return app;
}
