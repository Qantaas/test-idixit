import fetch from "node-fetch";
import { load } from "cheerio";
import fs from "fs";
import isEqual from "lodash.isequal";
import axios from "axios";

// function to get the raw data
const getRawData = (URL) => {
  return fetch(URL)
    .then((response) => response.text())
    .then((data) => {
      return data;
    });
};

// get the last stored review
const getLastReview = () => {
  let rawData = fs.readFileSync("last_review.json");

  let lastReview = JSON.parse(rawData);
  lastReview.date = new Date(lastReview.date);
  return lastReview;
};

const setLastReview = (review) => {
  let data = JSON.stringify(review);
  fs.writeFileSync("last_review.json", data);
};

const sendDataToAPI = async (review) => {
  const auth = {
    username: "aE6pN5bN7iI0pA1mA4zK9tZ6wZ8kY9cV",
    password: "oB1kO6cT6pR7cZ3sS1wT5nM7rY2bE8qD",
  };
  const url = "https://api.idixit.com/v1/reviews";

  const body = {
    type: "premium",
    establishment_id: "1b9447c0",
    orgin: "Booking (test)",
    username: review.username,
    user_location: review.user_location,
    language: review.language,
    global_rating: review.global_rating,
    date: review.date,
    title: review.title,
    positive_text: review.positive_text,
    negative_text: review.negative_text,
    context: review.context,
  };

  try {
    const result = await axios.post(url, body, { auth: auth });
  } catch (err) {
    console.log(err.response);
  }
};

const scrapeData = async () => {
  let keepScraping = true;
  let offset = 0;
  const newReviews = [];
  const lastReview = getLastReview();

  while (keepScraping) {
    const URL = `https://www.booking.com/reviewlist.fr.html?label=gen173nr-1DCAsoTUIabGVzLWxvZGdlcy1zYWludGUtdmljdG9pcmVIDVgEaE2IAQGYAQ24ARnIAQ_YAQPoAQH4AQKIAgGoAgO4ArO-gJIGwAIB0gIkNjc5NDI1ZjctMjViMS00YmRhLTg2NjEtMjUyN2JkYWNlMGEy2AIE4AIB;sid=70454d6911fe5e3eb9027703c5bf3ac2;cc1=fr&pagename=les-lodges-sainte-victoire&r_lang=&review_topic_category_id=&type=total&score=&sort=f_recent_desc&room_id=&time_of_year=&dist=1&offset=${offset}&rows=100&rurl=&text=&translate=&_=1648369461592"`;
    const rawData = await getRawData(URL);
    const parsedData = load(rawData);

    // get reviews list
    let children = parsedData(".c-review-block").children();

    for (let [key, value] of Object.entries(children)) {
      if (value.type === "tag" && value.attribs?.class === "bui-grid") {
        let reviewObject = {};
        value.children.forEach((element) => {
          if (element.type !== "tag") {
            return;
          }
          if (element.attribs.class.includes("left")) {
            reviewObject = getLeftBlockInfos(element, reviewObject);
          } else if (element.attribs.class.includes("right")) {
            reviewObject = getRightBlockInfos(element, reviewObject);
          }
        });
        if (
          +reviewObject.date.getFullYear() >= 2022 &&
          !isEqual(JSON.stringify(lastReview), JSON.stringify(reviewObject))
        ) {
          // convert date to unix timestamp
          reviewObject.date = reviewObject.date.getTime();
          newReviews.push(reviewObject);
        } else {
          keepScraping = false;
          break;
        }
      }
    }
    offset = newReviews.length;
  }
  if (newReviews.length !== 0) {
    newReviews.forEach((review) => {
        sendDataToAPI(review);
    });
    // store the last review scraped
    setLastReview(newReviews[0]);
  }
};

const getLeftBlockInfos = (reviewBlock, obj) => {
  const parse = load(reviewBlock);
  obj.username = parse(".bui-avatar-block__title").text(); // user name
  obj.user_location = parse(".bui-avatar-block__subtitle").text().trim(); // origin
  obj.context = parse(".bui-list__body").text().trim(); // context

  return obj;
};

const getRightBlockInfos = (reviewBlock, obj) => {
  const parse = load(reviewBlock);
  obj.language = parse(".c-review__body")[0].attribs.lang; // langue
  obj.global_rating = parse(".bui-review-score__badge").text().trim(); // score
  obj.date = convertDate(parse(".c-review-block__date").text().trim()); // date
  obj.title = parse(".c-review-block__title.c-review__title--ltr")
    .text()
    .trim(); // titre
  let reviewTexts = getReviewText(parse);
  obj.positive_text = reviewTexts.positive_text;
  obj.negative_text = reviewTexts.negative_text;
  return obj;
};

const getReviewText = (reviewBlock) => {
  let text = reviewBlock(".c-review__inner.c-review__inner--ltr").text().trim();
  let formatedText = text.split(/Traduction en cours....../gm)[0];
  let likeReview;
  let dislikeReview;
  let arrayText = formatedText.split("·");
  for (let i = 0; i !== arrayText.length; i++) {
    if (arrayText[i].includes("A aimé")) {
      likeReview = arrayText[i + 1].split("N'a pas aimé")[0].trim();
    } else if (arrayText[i].includes("N'a pas aimé")) {
      dislikeReview = arrayText[i + 1].trim();
    }
  }
  return { positive_text: likeReview, negative_text: dislikeReview };
};

// stringDate format example: "Commentaire envoyé le 24 mars 2022"
// returns a Date type object
const convertDate = (stringDate) => {
  stringDate = stringDate.replace("Commentaire envoyé le ", "").split(" ");
  const months = {
    janvier: 1,
    février: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    août: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    décembre: 12,
  };
  stringDate[1] = months[stringDate[1]];
  // from [day, month, year] to [month, day, year]
  let goodFormatArray = [stringDate[1], stringDate[0], stringDate[2]];
  return new Date(goodFormatArray);
};

scrapeData();
