const express = require("express");
const app = express();

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const bcrypt = require("bcrypt");
const dbPath = path.join(__dirname, "twitterClone.db");
const jwt = require("jsonwebtoken");

let db = null;

app.use(express.json());

//Data Base initialization
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB error at ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//middleware function checkDataValidation for API 1
const checkDataValidation = async (request, response, next) => {
  const { username, name, password, gender } = request.body;
  let condition = true;

  const checkUserExisted = `
        SELECT * FROM user WHERE username = '${username}';
    `;
  const checkStatus = await db.get(checkUserExisted);

  if (checkStatus !== undefined) {
    response.status(400);
    response.send("User already exists");
    condition = false;
  }
  if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
    condition = false;
  }
  if (condition) {
    next();
  }
};

//API 1
app.post("/register/", checkDataValidation, async (request, response) => {
  const { username, name, password, gender } = request.body;
  const passwordValue = await bcrypt.hash(password, 10);

  const postDataToTable = `
    INSERT INTO 
        user(name,username,password,gender)
    VALUES('${name}','${username}','${passwordValue}','${gender}');
  `;

  await db.run(postDataToTable);
  response.send("User created successfully");
});

//API 2
app.delete("/register/:id/", async (request, response) => {
  const { id } = request.params;
  console.log(id);
  const removeUser = `DELETE FROM user WHERE user_id = ${id};`;
  await db.run(removeUser);
  response.send("User removed successfully");
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const checkUserLogin = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(checkUserLogin);

  if (userDetails == undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passwordStatus = await bcrypt.compare(password, userDetails.password);

    if (passwordStatus) {
      const payload = {
        username: username,
      };

      const jwtToken = await jwt.sign(payload, "THE_SECRET_CODE");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Middleware function to check JWT
const checkJwtToken = async (request, response, next) => {
  let jwtToken;

  const auth = request.headers["authorization"];
  if (auth !== undefined) {
    jwtToken = auth.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const tokenStatus = await jwt.verify(
      jwtToken,
      "THE_SECRET_CODE",
      async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.user = payload.username;
          next();
        }
      }
    );
  }
};

//API 3
app.get("/user/tweets/feed/", checkJwtToken, async (request, response) => {
  const user = request.user;
  console.log(user);
  const reqQuery = `
    SELECT
        (
            SELECT
                username
            FROM
                user
            WHERE 
                user.user_id = tweet.user_id
        ) AS username,
        tweet.tweet,
        tweet.date_time AS dateTime
    FROM 
        user
    INNER JOIN follower
        ON user.user_id == follower.follower_user_id
    INNER JOIN tweet
        ON tweet.user_id == follower.following_user_id
    WHERE 
        user.username = '${user}'
    ORDER BY 
        tweet.date_time DESC
    LIMIT 4 ;
    `;
  const results = await db.all(reqQuery);
  response.send(results);
});

//API 4
app.get("/user/following/", checkJwtToken, async (request, response) => {
  const user = request.user;
  const getAllUserNames = `
        SELECT 
            (
                SELECT 
                    user.name
                FROM
                    user
                WHERE
                    user.user_id = follower.following_user_id
            ) AS name
        FROM 
            user
        INNER JOIN 
            follower
        ON 
            user.user_id = follower.follower_user_id
        WHERE 
            user.username = '${user}';
    `;

  const followingNames = await db.all(getAllUserNames);
  response.send(followingNames);
});

//API 5
app.get("/user/followers/", checkJwtToken, async (request, response) => {
  const user = request.user;
  const fetchUserFollowers = `
        SELECT 
            (
                SELECT 
                    name 
                FROM 
                    user 
                WHERE 
                    user.user_id = follower.follower_user_id 
            ) AS name
        FROM 
            user 
        JOIN
            follower 
        ON 
            user.user_id = follower.following_user_id 
        WHERE
            user.username = '${user}';

    `;
  const allFollowers = await db.all(fetchUserFollowers);
  response.send(allFollowers);
});

//API 6
app.get("/tweets/:tweetId/", checkJwtToken, async (request, response) => {
  const { tweetId } = request.params;
  const user = request.user;

  const getUsers = `
        SELECT 
           tweet.tweet,
           ( 
               SELECT
                    COUNT(like_id)
                FROM 
                    like
                WHERE 
                    like.tweet_id = tweet.tweet_id
           ) AS likes,
           ( 
               SELECT
                    COUNT(reply)
                FROM 
                    reply
                WHERE 
                    reply.tweet_id = tweet.tweet_id
           ) AS replies,
           tweet.date_time AS dateTime
        FROM 
            user
        INNER JOIN follower 

        ON user.user_id = follower.follower_user_id

        INNER JOIN tweet 

        ON follower.following_user_id = tweet.user_id

        WHERE 
            user.username = '${user}' AND tweet.tweet_id = ${tweetId};
    `;
  const userIds = await db.get(getUsers);

  if (!userIds) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(userIds);
  }
});

//API 7
app.get("/tweets/:tweetId/likes/", checkJwtToken, async (request, response) => {
  const { tweetId } = request.params;
  const user = request.user;
  const getLikes = ` 
        SELECT 
            (
                SELECT
                    user.username
                FROM 
                    user
                WHERE
                    user.user_id = like.user_id
            ) AS name
        FROM
            user 
        INNER JOIN 
            follower
        ON
            user.user_id = follower.follower_user_id 
        INNER JOIN 
            tweet
        ON 
            follower.following_user_id = tweet.user_id
        INNER JOIN
            like
        ON
            tweet.tweet_id = like.tweet_id
        WHERE 
            user.username = '${user}' AND tweet.tweet_id = ${tweetId};
    `;
  const likedUser = await db.all(getLikes);
  if (likedUser.length < 1) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let results = [];
    for (let value of likedUser) {
      results.push(value.name);
    }
    response.send({ likes: results });
  }
});

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  checkJwtToken,
  async (request, response) => {
    const user = request.user;
    const { tweetId } = request.params;

    const getReplies = `
        SELECT 
            tweet.tweet,
            (
                SELECT 
                    user.name 
                FROM 
                    user
                WHERE
                    user.user_id = reply.user_id
            ) AS name,
            reply.reply
        FROM 
            user 
        INNER JOIN
            follower
        ON 
            user.user_id = follower.follower_user_id
        INNER JOIN
            tweet
        ON 
            follower.following_user_id = tweet.user_id 
        INNER JOIN
            reply
        ON 
            tweet.tweet_id = reply.tweet_id 
        WHERE 
            user.username = '${user}' AND tweet.tweet_id = ${tweetId}
    ;`;

    const replies = await db.all(getReplies);

    if (replies.length < 1) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let repliesArray = [];

      for (let value of replies) {
        tweet = value.tweet;
        repliesArray.push({ name: value.name, reply: value.reply });
      }
      response.send({ replies: repliesArray });
    }
  }
);

//API 9
app.get("/user/tweets/", checkJwtToken, async (request, response) => {
  const user = request.user;

  const getTweetData = `
        SELECT 
           DISTINCT tweet.tweet,
           (
               SELECT 
                COUNT(like.like_id)
               FROM 
                like
               WHERE
                tweet.tweet_id = like.tweet_id
           ) AS likes,
           (
               SELECT 
                COUNT(reply.reply_id)
               FROM 
                reply
               WHERE
                tweet.tweet_id = reply.tweet_id
           ) AS replies,
           tweet.date_time AS dateTime
        FROM 
            user 
        INNER JOIN
            tweet
        ON 
            user.user_id = tweet.user_id 
        INNER JOIN
            reply
        ON 
            tweet.tweet_id = reply.tweet_id 
        INNER JOIN
                like
        ON
            reply.tweet_id = like.tweet_id
        WHERE 
            user.username = '${user}'
    ;`;

  const tweetDetails = await db.all(getTweetData);
  response.send(tweetDetails);
});

//API 10
app.post("/user/tweets/", checkJwtToken, async (request, response) => {
  const { tweet } = request.body;
  const username = request.user;
  const getUserDetails = `
    SELECT 
        * 
    FROM 
        user
    WHERE
        username = '${username}';
  `;

  const userDetails = await db.get(getUserDetails);

  let currDate = new Date();
  let month = currDate.getMonth() + 1;
  let year = currDate.getFullYear();
  let day = currDate.getDate();

  let hours =
    currDate.getHours() < 10 ? "0" + currDate.getHours() : currDate.getHours();
  let minutes = currDate.getMinutes();

  let seconds = currDate.getSeconds();

  let nDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  const postTweet = `
    INSERT INTO 
        tweet(tweet,user_id,date_time)
    VALUES('${tweet}',${userDetails.user_id},'${nDate}');
  `;
  const tweetDetails = await db.run(postTweet);
  response.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId/", checkJwtToken, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.user;

  const getUserDetails = `
    SELECT 
        * 
    FROM 
        user 
    WHERE 
        username = '${username}';
  `;
  const userDetails = await db.get(getUserDetails);

  const deleteTweet = `
    DELETE FROM
        tweet
    WHERE 
        tweet_id = '${tweetId}' AND user_id = ${userDetails.user_id};
  `;
  const deleteStatus = await db.run(deleteTweet);

  if (deleteStatus.changes < 1) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send("Tweet Removed");
  }
});

module.exports = app;
