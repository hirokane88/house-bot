const assert = require('assert');
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const Listing = require("./model/Listing");

async function main() {
  while (true) {
    try {
      await connectToMongoDb();
      const collectionArray = await dropCollection(Listing); //copy and drop the current collection
      const browser = await puppeteer.launch({
        headless: false
      });
      const page = await browser.newPage();
      let listings = await scrapeListings(page); //scrape the housing pages listings

      listings = await scrapeListingsDescriptions(listings, page); //scrape the descriptions of each listing
      listings.sort((a, b) => {
        return a.daysAgo - b.daysAgo;
      });
      await page.close();
      await browser.close();
      console.log(listings);
      process.exit(0);
    } catch (err) {
      console.log(err);
      process.exit(0);
    }
  }
}

async function connectToMongoDb() {
  try {
    const mongoUrl = "mongodb+srv://admin:adminPassword@cluster0.z4lwg.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    console.log("connected to mongodb");
  } catch (err) {
    console.log(err);
    process.exit(0);
  }
}

async function dropCollection(model) {
  try {
    let copy = [];
    const collection = await model.find({});
    if (collection.length !== 0) {
      for (let i = 0; i < collection.length; i++) {
        copy.push(collection[i]);
      }
      await mongoose.connection.db.dropCollection('listings');
    }
    return copy;
  } catch (err) {
    console.log(err);
    process.exit(0);
  }
}

async function scrapeListings(page) {
  await page.goto("https://sfbay.craigslist.org/search/scz/apa?postal=95060&max_price=2000&availabilityMode=0&sale_date=all+dates");
  const html = await page.content();
  const $ = cheerio.load(html);
  const listings = $(".result-info").map((index, element) => {
    const timeElement = $(element).find(".result-date");
    const titleElement = $(element).find(".result-title");
    const resultPriceElement = $(element).find(".result-meta").find(".result-price");
    const timePosted = new Date($(timeElement).attr("datetime"));
    const title = $(titleElement).text().toLowerCase();
    const price = $(resultPriceElement).text();
    const url = $(titleElement).attr("href");
    title.trim();
    price.trim();
    const daysAgo = "999999";
    const address = "null";
    const specs = "null";
    return {
      timePosted,
      daysAgo,
      title,
      address,
      price,
      specs,
      url
    };
  }).get();
  return listings; //return an array of objects(house listings)
}

async function scrapeListingsDescriptions(listings, page) {
  for (var i = 0; i < listings.length; i++) { //loop through every single listing
    console.log(listings.length - i);
    await page.goto(listings[i].url); //access the "url" that we scraped in scrapedListings
    const html = await page.content();
    const $ = cheerio.load(html);
    const daysAgoElement = $(".timeago").first();
    const specsElements = $(".shared-line-bubble");
    listings[i].daysAgo = daysAgo(listings[i], daysAgoElement);
    listings[i].address = $("div.mapaddress").text();
    listings[i].specs = $format($, specsElements);
    const listingModel = new Listing(listings[i]);
    await listingModel.save();
    const random = (Math.random() + 0.5) * 1000; //0.5 - 1.499... seconds
    await sleep(random);
  }
  return listings;
}

function daysAgo(listing, daysAgoElement){
  const daysAgo = daysAgoElement.text();
  if (!daysAgo.includes("day") && zeroDays(listing.timePosted)) {
    return 0;
  } else if (daysAgo.match(/\d+/) === null) {
    return 1;
  } else {
    return Number(daysAgo.match(/\d+/).toString());
  }
}

function zeroDays(date) {
  console.log("entered");
  let currDate = new Date();
  const diffTime = Math.abs(currDate - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); //min difference of days
  if (diffDays === 0) {
    return true;
  }
  return false;
}

function $format($, elements) {
  const array = elements.map((index, element) => { //loop through bed/bath, sqft, etc.
    return $(element).text().toLowerCase(); //return the object to the array created by map()
  }).get();
  return array.join(", ");
}

async function sleep(miliseconds) {
  return new Promise(resolve => setTimeout(resolve, miliseconds));
}

main();
