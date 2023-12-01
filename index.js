require("dotenv").config();

const express = require("express");
const mysql = require("mysql");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) throw err;
  console.log("Connected to the database");
});

const app = express();

app.use(
  cors({
    origin: "https://web-readinglife-frontend-32updzt2alplw0emu.sel4.cloudtype.app",
  })
);
app.use(express.json());
app.use("/imgs", express.static(path.join(__dirname, "src/imgs")));

const dir = "./src/imgs";
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./src/imgs");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${file.originalname}_${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage: storage });

app.get("/", (req, res) => {
  const query = "SELECT * FROM posts ORDER BY id DESC";
  db.query(query, (err, results) => {
    if (err) throw err;

    const posts = results.map((post) => ({
      ...post,
      img_path: `${process.env.BACKEND_URL}${post.img_path.replace("/src/imgs", "/imgs")}`,
    }));

    res.status(200).json(posts);
  });
});

app.get("/:bookName", (req, res) => {
  const bookName = req.params.bookName;
  const query = "SELECT * FROM posts WHERE name = ?";

  db.query(query, bookName, (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    } else if (results.length === 0) {
      res.status(404).json({ error: "Book not found" });
    } else {
      const comments = results[0].comments ? JSON.parse(results[0].comments).reverse() : [];
      const post = {
        ...results[0],
        comments,
        img_path: `${process.env.BACKEND_URL}${results[0].img_path.replace("/src/imgs", "/imgs")}`,
      };

      res.status(200).json(post);
    }
  });
});

app.put("/:bookName", upload.any("img"), (req, res) => {
  const bookName = req.params.bookName;
  const newBookInfo = req.body;
  const selectQuery = "SELECT * FROM posts WHERE name = ?";

  db.query(selectQuery, bookName, (err, results) => {
    if (err) {
      console.error(err.stack);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    } else if (results.length === 0) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    const oldImgPath = path.join(__dirname, results[0].img_path);
    const updateFields = {
      name: newBookInfo.name || results[0].name,
      author: newBookInfo.author || results[0].author,
      category: newBookInfo.category || results[0].category,
      review: newBookInfo.review || results[0].review,
      img_path: req.files.length > 0 ? `/src/imgs/${req.files[0].filename}` : results[0].img_path,
    };

    if (req.files.length > 0 && oldImgPath !== updateFields.img_path) {
      fs.unlink(oldImgPath, (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to delete old image file" });
          return;
        }
      });
    }

    const updateQuery = "UPDATE posts SET name = ?, author = ?, category = ?, review = ?, img_path = ? WHERE name = ?";

    db.query(updateQuery, [updateFields.name, updateFields.author, updateFields.category, updateFields.review, updateFields.img_path, bookName], (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
      } else {
        res.status(200).send("Successfully updated the book");
      }
    });
  });
});

app.delete("/:bookName", (req, res) => {
  const bookName = req.params.bookName;
  const query = "SELECT * FROM posts WHERE name = ?";

  db.query(query, bookName, (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    } else if (results.length === 0) {
      res.status(404).json({ error: "Book not found" });
      return;
    } else {
      const imgPath = path.join(__dirname, results[0].img_path);

      fs.unlink(imgPath, (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to delete image file" });
          return;
        }

        const deleteQuery = "DELETE FROM posts WHERE name = ?";

        db.query(deleteQuery, bookName, (err, result) => {
          if (err) {
            console.error(err);
            res.status(500).json({ error: "Internal Server Error" });
          } else {
            res.status(200).send("Successfully deleted the book");
          }
        });
      });
    }
  });
});

app.post("/create", upload.single("img"), (req, res) => {
  const { name, author, category, review } = req.body;
  const img_path = `/src/imgs/${req.file.filename}`;

  const query = "INSERT INTO posts (name, author, category, review, img_path) VALUES (?, ?, ?, ?, ?)";
  db.query(query, [name, author, category, review, img_path], (err, result) => {
    if (err) throw err;
    res.status(200).send("Successfully saved to the database");
  });
});

app.post("/comment/:bookName", express.json(), (req, res) => {
  const bookName = req.params.bookName;
  const comment = req.body.comment;

  const selectQuery = "SELECT * FROM posts WHERE name = ?";
  db.query(selectQuery, bookName, (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    } else if (results.length === 0) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    const comments = results[0].comments ? JSON.parse(results[0].comments) : [];
    comments.push(comment);

    const updateQuery = "UPDATE posts SET comments = ? WHERE name = ?";
    db.query(updateQuery, [JSON.stringify(comments), bookName], (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
      } else {
        res.status(200).send("Successfully added the comment");
      }
    });
  });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
