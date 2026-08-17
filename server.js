import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient, ObjectId, GridFSBucket } from "mongodb";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
====================================================
CONFIGURATION
====================================================
*/

const PORT = process.env.PORT || 3000;

const MONGODB_ATLAS_URL =
  process.env.MONGODB_ATLAS_URL;

const DATABASE_NAME = "jarvisQuiz";
const COLLECTION_NAME = "quizzes";

/*
====================================================
DATABASE VARIABLES
====================================================
*/

let client;
let db;
let collection;
let gridfs;

/*
====================================================
MONGODB CONNECTION
====================================================
*/

async function connectDatabase() {
  if (!MONGODB_ATLAS_URL) {
    throw new Error(
      "MONGODB_ATLAS_URL is missing. Add it to your .env file locally or Render Environment Variables."
    );
  }

  client = new MongoClient(
    MONGODB_ATLAS_URL
  );

  await client.connect();

  db = client.db(
    DATABASE_NAME
  );

  collection = db.collection(
    COLLECTION_NAME
  );

  /*
  MongoDB GridFS bucket
  for option images
  */

  gridfs = new GridFSBucket(
    db,
    {
      bucketName:
        "optionImages"
    }
  );

  await collection.createIndex({
    createdAt: -1
  });

  console.log(
    "========================================="
  );

  console.log(
    " J.A.R.V.I.S. QUIZ CORE"
  );

  console.log(
    " MongoDB Atlas: CONNECTED"
  );

  console.log(
    ` Database: ${DATABASE_NAME}`
  );

  console.log(
    " GridFS: optionImages"
  );

  console.log(
    "========================================="
  );
}

/*
====================================================
RESPONSE HELPER
====================================================
*/

function send(
  res,
  status,
  data,
  contentType = "application/json"
) {
  res.writeHead(
    status,
    {
      "Content-Type":
        contentType,

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type",

      "Access-Control-Allow-Methods":
        "GET,POST,PUT,DELETE,OPTIONS"
    }
  );

  if (
    typeof data ===
    "string"
  ) {
    res.end(data);
  } else {
    res.end(
      JSON.stringify(data)
    );
  }
}

/*
====================================================
REQUEST BODY
====================================================
*/

function readBody(req) {
  return new Promise(
    (resolve, reject) => {

      let raw = "";

      req.on(
        "data",
        chunk => {

          raw += chunk;

          /*
          15 MB request limit
          */

          if (
            raw.length >
            15 * 1024 * 1024
          ) {
            reject(
              new Error(
                "Request is too large. Maximum size is 15 MB."
              )
            );

            req.destroy();
          }
        }
      );

      req.on(
        "end",
        () => {

          try {

            resolve(
              raw
                ? JSON.parse(raw)
                : {}
            );

          } catch {

            reject(
              new Error(
                "Invalid JSON."
              )
            );
          }
        }
      );

      req.on(
        "error",
        reject
      );
    }
  );
}

/*
====================================================
QUIZ VALIDATION
====================================================
*/

function cleanQuiz(input) {

  const title =
    String(
      input.title || ""
    ).trim();

  const description =
    String(
      input.description || ""
    ).trim();

  if (!title) {
    throw new Error(
      "Quiz title is required."
    );
  }

  if (
    !Array.isArray(
      input.questions
    ) ||
    input.questions.length === 0
  ) {
    throw new Error(
      "At least one question is required."
    );
  }

  const questions =
    input.questions.map(
      (
        questionData,
        questionIndex
      ) => {

        const question =
          String(
            questionData.question ||
              ""
          ).trim();

        if (!question) {
          throw new Error(
            `Question ${
              questionIndex + 1
            } is empty.`
          );
        }

        /*
        ------------------------------------------
        OPTIONS
        ------------------------------------------
        */

        if (
          !Array.isArray(
            questionData.options
          ) ||
          questionData.options.length !==
            4
        ) {
          throw new Error(
            `Question ${
              questionIndex + 1
            } must have exactly 4 options.`
          );
        }

        const options =
          questionData.options.map(
            option => ({

              text:
                String(
                  option?.text ||
                    ""
                ).trim(),

              imageUrl:
                String(
                  option?.imageUrl ||
                    ""
                ).trim()
            })
          );

        if (
          options.some(
            option =>
              !option.text
          )
        ) {
          throw new Error(
            `Question ${
              questionIndex + 1
            } contains an empty option.`
          );
        }

        /*
        ------------------------------------------
        CORRECT ANSWER
        ------------------------------------------
        */

        const correctAnswer =
          Number(
            questionData.correctAnswer
          );

        if (
          !Number.isInteger(
            correctAnswer
          ) ||
          correctAnswer < 0 ||
          correctAnswer > 3
        ) {
          throw new Error(
            `Question ${
              questionIndex + 1
            } has an invalid correct answer.`
          );
        }

        /*
        ------------------------------------------
        TIMER
        ------------------------------------------
        */

        const timerSeconds =
          Number(
            questionData.timerSeconds
          );

        if (
          !Number.isFinite(
            timerSeconds
          ) ||
          timerSeconds < 1
        ) {
          throw new Error(
            `Question ${
              questionIndex + 1
            } has an invalid timer.`
          );
        }

        return {

          question,

          options,

          correctAnswer,

          explanation:
            String(
              questionData.explanation ||
                ""
            ).trim(),

          timerSeconds:
            Math.floor(
              timerSeconds
            )
        };
      }
    );

  return {

    title,

    description,

    questions,

    updatedAt:
      new Date()
  };
}

/*
====================================================
IMAGE UPLOAD
POST /api/images
====================================================
*/

async function uploadImage(
  req,
  res
) {

  try {

    const body =
      await readBody(
        req
      );

    if (
      !body.dataUrl
    ) {

      return send(
        res,
        400,
        {
          error:
            "No image supplied."
        }
      );
    }

    /*
    Expected:
    data:image/png;base64,...
    */

    const match =
      body.dataUrl.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
      );

    if (!match) {

      return send(
        res,
        400,
        {
          error:
            "Invalid image format."
        }
      );
    }

    const contentType =
      match[1];

    const base64Data =
      match[2];

    const buffer =
      Buffer.from(
        base64Data,
        "base64"
      );

    /*
    Maximum individual image:
    10 MB
    */

    if (
      buffer.length >
      10 * 1024 * 1024
    ) {

      return send(
        res,
        400,
        {
          error:
            "Image must be smaller than 10 MB."
        }
      );
    }

    const filename =
      String(
        body.filename ||
          "option-image"
      )
        .replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

    const uploadStream =
      gridfs.openUploadStream(
        filename,
        {
          metadata: {
            contentType,

            uploadedAt:
              new Date()
          }
        }
      );

    uploadStream.end(
      buffer
    );

    uploadStream.on(
      "finish",
      () => {

        send(
          res,
          201,
          {
            success:
              true,

            fileId:
              uploadStream.id.toString(),

            imageUrl:
              `/api/images/${uploadStream.id.toString()}`
          }
        );
      }
    );

    uploadStream.on(
      "error",
      error => {

        console.error(
          "GridFS upload error:",
          error
        );

        if (
          !res.headersSent
        ) {

          send(
            res,
            500,
            {
              error:
                "Image upload failed."
            }
          );
        }
      }
    );

  } catch (error) {

    console.error(
      "Image upload failed:",
      error
    );

    send(
      res,
      400,
      {
        error:
          error.message
      }
    );
  }
}

/*
====================================================
SERVE GRIDFS IMAGE
GET /api/images/:id
====================================================
*/

async function serveImage(
  req,
  res,
  id
) {

  try {

    if (
      !ObjectId.isValid(id)
    ) {

      return send(
        res,
        400,
        {
          error:
            "Invalid image ID."
        }
      );
    }

    const fileId =
      new ObjectId(id);

    const files =
      await db
        .collection(
          "optionImages.files"
        )
        .find({
          _id: fileId
        })
        .toArray();

    if (
      !files.length
    ) {

      return send(
        res,
        404,
        {
          error:
            "Image not found."
        }
      );
    }

    const file =
      files[0];

    res.writeHead(
      200,
      {
        "Content-Type":
          file.metadata
            ?.contentType ||
          "image/jpeg",

        "Cache-Control":
          "public, max-age=31536000",

        "Access-Control-Allow-Origin":
          "*"
      }
    );

    const downloadStream =
      gridfs.openDownloadStream(
        fileId
      );

    downloadStream.on(
      "error",
      error => {

        console.error(
          "GridFS download error:",
          error
        );

        if (
          !res.headersSent
        ) {

          send(
            res,
            404,
            {
              error:
                "Unable to load image."
            }
          );

        } else {

          res.end();
        }
      }
    );

    downloadStream.pipe(
      res
    );

  } catch (error) {

    console.error(
      "Image serving error:",
      error
    );

    if (
      !res.headersSent
    ) {

      send(
        res,
        500,
        {
          error:
            "Image loading failed."
        }
      );
    }
  }
}

/*
====================================================
DELETE GRIDFS IMAGE
====================================================
*/

async function deleteImage(
  id
) {

  if (
    !ObjectId.isValid(id)
  ) {
    return;
  }

  try {

    await gridfs.delete(
      new ObjectId(id)
    );

  } catch (error) {

    /*
    Image may already be gone.
    Don't break quiz deletion.
    */

    console.log(
      "Image deletion skipped:",
      error.message
    );
  }
}

/*
====================================================
QUIZ API
====================================================
*/

async function handleApi(
  req,
  res,
  url
) {

  try {

    if (
      !collection
    ) {

      return send(
        res,
        503,
        {
          error:
            "MongoDB Atlas is not connected."
        }
      );
    }

    /*
    ------------------------------------------
    GET ALL QUIZZES
    ------------------------------------------
    */

    if (
      req.method === "GET" &&
      url.pathname ===
        "/api/quizzes"
    ) {

      const quizzes =
        await collection
          .find({})
          .sort({
            createdAt:
              -1
          })
          .toArray();

      return send(
        res,
        200,
        quizzes
      );
    }

    /*
    ------------------------------------------
    QUIZ ID
    ------------------------------------------
    */

    const quizMatch =
      url.pathname.match(
        /^\/api\/quizzes\/([a-f0-9]{24})$/i
      );

    /*
    ------------------------------------------
    GET ONE QUIZ
    ------------------------------------------
    */

    if (
      quizMatch &&
      req.method === "GET"
    ) {

      const quiz =
        await collection.findOne(
          {
            _id:
              new ObjectId(
                quizMatch[1]
              )
          }
        );

      if (!quiz) {

        return send(
          res,
          404,
          {
            error:
              "Quiz not found."
          }
        );
      }

      return send(
        res,
        200,
        quiz
      );
    }

    /*
    ------------------------------------------
    CREATE QUIZ
    ------------------------------------------
    */

    if (
      req.method === "POST" &&
      url.pathname ===
        "/api/quizzes"
    ) {

      const body =
        await readBody(
          req
        );

      const quiz =
        cleanQuiz(
          body
        );

      quiz.createdAt =
        new Date();

      const result =
        await collection.insertOne(
          quiz
        );

      return send(
        res,
        201,
        {
          ...quiz,

          _id:
            result.insertedId
        }
      );
    }

    /*
    ------------------------------------------
    UPDATE QUIZ
    ------------------------------------------
    */

    if (
      quizMatch &&
      req.method === "PUT"
    ) {

      const body =
        await readBody(
          req
        );

      const quiz =
        cleanQuiz(
          body
        );

      const result =
        await collection.updateOne(
          {
            _id:
              new ObjectId(
                quizMatch[1]
              )
          },
          {
            $set:
              quiz
          }
        );

      if (
        !result.matchedCount
      ) {

        return send(
          res,
          404,
          {
            error:
              "Quiz not found."
          }
        );
      }

      const updated =
        await collection.findOne(
          {
            _id:
              new ObjectId(
                quizMatch[1]
              )
          }
        );

      return send(
        res,
        200,
        updated
      );
    }

    /*
    ------------------------------------------
    DELETE QUIZ
    ------------------------------------------
    */

    if (
      quizMatch &&
      req.method === "DELETE"
    ) {

      const quiz =
        await collection.findOne(
          {
            _id:
              new ObjectId(
                quizMatch[1]
              )
          }
        );

      if (!quiz) {

        return send(
          res,
          404,
          {
            error:
              "Quiz not found."
          }
        );
      }

      /*
      Delete associated images
      */

      for (
        const question
        of quiz.questions ||
        []
      ) {

        for (
          const option
          of question.options ||
          []
        ) {

          if (
            option.imageUrl
          ) {

            const match =
              option.imageUrl.match(
                /\/api\/images\/([a-f0-9]{24})$/i
              );

            if (match) {

              await deleteImage(
                match[1]
              );
            }
          }
        }
      }

      await collection.deleteOne(
        {
          _id:
            new ObjectId(
              quizMatch[1]
            )
        }
      );

      return send(
        res,
        200,
        {
          success:
            true
        }
      );
    }

    return send(
      res,
      404,
      {
        error:
          "API route not found."
      }
    );

  } catch (error) {

    console.error(
      "API ERROR:",
      error
    );

    return send(
      res,
      500,
      {
        error:
          error.message ||
          "Server error."
      }
    );
  }
}

/*
====================================================
STATIC FILE SERVER
====================================================
*/

function serveStaticFile(
  req,
  res,
  url
) {

  /*
  Remove query string automatically
  because URL.pathname is used.
  */

  let requestedPath =
    url.pathname;

  /*
  Root → index.html
  */

  if (
    requestedPath === "/"
  ) {

    requestedPath =
      "/index.html";
  }

  /*
  Decode URL safely
  */

  try {

    requestedPath =
      decodeURIComponent(
        requestedPath
      );

  } catch {

    return send(
      res,
      400,
      "Invalid URL",
      "text/plain"
    );
  }

  /*
  Prevent directory traversal
  */

  const distDirectory =
    path.resolve(
      __dirname,
      "dist"
    );

  const requestedFile =
    path.resolve(
      distDirectory,
      "." +
        requestedPath
    );

  if (
    !requestedFile.startsWith(
      distDirectory +
        path.sep
    ) &&
    requestedFile !==
      distDirectory
  ) {

    return send(
      res,
      403,
      "Forbidden",
      "text/plain"
    );
  }

  /*
  Content types
  */

  const contentTypes = {

    ".html":
      "text/html; charset=utf-8",

    ".js":
      "application/javascript; charset=utf-8",

    ".mjs":
      "application/javascript; charset=utf-8",

    ".css":
      "text/css; charset=utf-8",

    ".json":
      "application/json; charset=utf-8",

    ".png":
      "image/png",

    ".jpg":
      "image/jpeg",

    ".jpeg":
      "image/jpeg",

    ".gif":
      "image/gif",

    ".webp":
      "image/webp",

    ".svg":
      "image/svg+xml",

    ".ico":
      "image/x-icon",

    ".txt":
      "text/plain; charset=utf-8"
  };

  /*
  Try requested file first
  */

  fs.readFile(
    requestedFile,
    (
      error,
      data
    ) => {

      if (!error) {

        const extension =
          path.extname(
            requestedFile
          ).toLowerCase();

        res.writeHead(
          200,
          {
            "Content-Type":
              contentTypes[
                extension
              ] ||
              "application/octet-stream"
          }
        );

        return res.end(
          data
        );
      }

      /*
      ============================================
      SPA FALLBACK
      ============================================

      If React route doesn't physically
      exist, serve index.html.
      */

      const indexPath =
        path.join(
          distDirectory,
          "index.html"
        );

      fs.readFile(
        indexPath,
        (
          indexError,
          indexData
        ) => {

          if (
            indexError
          ) {

            console.error(
              "dist/index.html not found."
            );

            return send(
              res,
              404,
              "Production build not found. Run npm run build first.",
              "text/plain"
            );
          }

          res.writeHead(
            200,
            {
              "Content-Type":
                "text/html; charset=utf-8"
            }
          );

          res.end(
            indexData
          );
        }
      );
    }
  );
}

/*
====================================================
HTTP SERVER
====================================================
*/

const server =
  http.createServer(
    async (
      req,
      res
    ) => {

      /*
      ------------------------------------------
      CORS PREFLIGHT
      ------------------------------------------
      */

      if (
        req.method ===
        "OPTIONS"
      ) {

        res.writeHead(
          204,
          {
            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Headers":
              "Content-Type",

            "Access-Control-Allow-Methods":
              "GET,POST,PUT,DELETE,OPTIONS"
          }
        );

        return res.end();
      }

      const url =
        new URL(
          req.url,
          `http://${
            req.headers.host ||
            "localhost"
          }`
        );

      /*
      ------------------------------------------
      GRIDFS IMAGE
      ------------------------------------------
      */

      const imageMatch =
        url.pathname.match(
          /^\/api\/images\/([a-f0-9]{24})$/i
        );

      if (
        imageMatch &&
        req.method === "GET"
      ) {

        return serveImage(
          req,
          res,
          imageMatch[1]
        );
      }

      /*
      ------------------------------------------
      IMAGE UPLOAD
      ------------------------------------------
      */

      if (
        url.pathname ===
          "/api/images" &&
        req.method ===
          "POST"
      ) {

        return uploadImage(
          req,
          res
        );
      }

      /*
      ------------------------------------------
      ALL API ROUTES
      ------------------------------------------
      */

      if (
        url.pathname.startsWith(
          "/api/"
        )
      ) {

        return handleApi(
          req,
          res,
          url
        );
      }

      /*
      ------------------------------------------
      VITE PRODUCTION BUILD
      ------------------------------------------
      */

      return serveStaticFile(
        req,
        res,
        url
      );
    }
  );

/*
====================================================
START SERVER
====================================================
*/

async function startServer() {

  try {

    await connectDatabase();

    server.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          "========================================="
        );

        console.log(
          ` J.A.R.V.I.S. SERVER RUNNING`
        );

        console.log(
          ` Port: ${PORT}`
        );

        console.log(
          ` Environment: ${
            process.env.NODE_ENV ||
            "development"
          }`
        );

        console.log(
          "========================================="
        );

        console.log(
          `API: http://localhost:${PORT}/api/quizzes`
        );

        if (
          fs.existsSync(
            path.join(
              __dirname,
              "dist"
            )
          )
        ) {

          console.log(
            "Vite production build: AVAILABLE"
          );

        } else {

          console.log(
            "Vite production build: NOT FOUND"
          );

          console.log(
            "Run: npm run build"
          );
        }
      }
    );

  } catch (error) {

    console.error(
      "========================================="
    );

    console.error(
      " SERVER STARTUP FAILED"
    );

    console.error(
      "========================================="
    );

    console.error(
      error.message
    );

    console.error(
      ""
    );

    console.error(
      "Check:"
    );

    console.error(
      "1. MONGODB_ATLAS_URL"
    );

    console.error(
      "2. MongoDB Atlas Network Access"
    );

    console.error(
      "3. MongoDB database user/password"
    );

    console.error(
      "4. MongoDB Atlas connection string"
    );

    process.exit(1);
  }
}

startServer();

/*
====================================================
GRACEFUL SHUTDOWN
====================================================
*/

process.on(
  "SIGINT",
  async () => {

    console.log(
      "\nShutting down..."
    );

    try {

      if (client) {
        await client.close();
      }

    } catch (error) {

      console.error(
        error
      );
    }

    process.exit(
      0
    );
  }
);

process.on(
  "SIGTERM",
  async () => {

    console.log(
      "\nSIGTERM received. Shutting down..."
    );

    try {

      if (client) {
        await client.close();
      }

    } catch (error) {

      console.error(
        error
      );
    }

    process.exit(
      0
    );
  }
);