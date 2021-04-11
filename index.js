const assert = require('assert');
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const Listing = require("./model/Listing");

const dbAdmin = *ENTER YOUR MONGODB ATLAS, DATABASE USERNAME*;
const adminPassword = *ENTER YOUR MONGODB ATLAS, USERNAME PASSWORD*;
const logIn = dbAdmin + ":" + adminPassword;

const mongoUrl = "mongodb+srv://"+logIn+"@cluster0.z4lwg.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";  //MongoDB Atlas account connection
const housingPageURL = "https://sfbay.craigslist.org/search/scz/apa?postal=95060&max_price=1700&availabilityMode=0&sale_date=all+dates" //Craigslist housing page to be scraped


async function main() {                                             //MAIN FUNCTION OF THE PROGRAM
  while (true) {
    try {
      await connectToMongoDb();
      const collectionArray = await dropCollection(Listing);        //drop the current "listings" collection and return its contents
      const browser = await puppeteer.launch({ headless: false });
      const page = await browser.newPage();
      let listings = await scrapeListings(page);                    //scrape the "housing home page" listings
      listings = await scrapeListingsDescriptions(listings, page);  //scrape the descriptions of each of the house listing
      listings = await sortListings(listings);                      //sort listings by "daysAgo" posted (newest first)
      await saveListings(listings);                                 //save listings as the MongoDB "Listings" collection
      await page.close();
      await browser.close();
      console.log(listings);
      process.exit(0);
    } catch (err) {                                       //if main() function fails
      console.log(err);
      process.exit(0);
    }
  }
}

async function connectToMongoDb() {                      //FUNCTION TO CONNECT TO MONGODB
  try {
      await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    console.log("connected to mongodb");
  } catch (err) {                                        //log error if connection fails
    console.log(err);
    process.exit(0);
  }
}

async function dropCollection(model) {                            //FUNCTION TO RETURN ALL ITEMS OF A COLLECTION AS AN ARRAY...
  try {                                                           //...AND *DROPS* THE COLLECTION
    const collection = await model.find({});                      //get all contents of the collection
    if (collection.length !== 0) {
      await mongoose.connection.db.dropCollection('listings', (err, res) => { //drop the collection
          assert.equal(err, null);
      });
    }
    return collection;                                           //return the collection as an array of objects
  } catch (err) {
    console.log(err);
    process.exit(0);
  }
}

async function scrapeListings(page) {                           //FUNCTION TO SCRAPE LISTINGS FROM THE CRAIGSLIST HOUSING, MAIN PAGE...
  try {                                                         //...AND RETURN THE LISTINGS AS AN ARRAY OF OBJECTS
    await page.goto(housingPageURL);                            //access a craiglist housing page via url
    const html = await page.content();
    const $ = cheerio.load(html);
    const listings = $(".result-info").map((index, element) => {  //loop through all elements of class "result-info" and store...
      const timeElement = $(element).find(".result-date");
      const titleElement = $(element).find(".result-title");
      const resultPriceElement = $(element).find(".result-meta").find(".result-price");
      const timePosted = new Date($(timeElement).attr("datetime"));
      const title = $(titleElement).text().toLowerCase();
      const price = $(resultPriceElement).text();
      const url = $(titleElement).attr("href");
      title.trim();
      price.trim();
      const daysAgo = "999999";                                //add default values for items that still need to be scraped
      const address = "null";
      const specs = "null";
      return {                                                 //return the current listing with its scraped values
        timePosted,
        daysAgo,
        title,
        address,
        price,
        specs,
        url
      };
    }).get();
    return listings;                                           //return the array of scraped listings
  } catch {
    console.log(err);                                          //log error if scraping listings fails
    process.exit(0);
  }
}

async function scrapeListingsDescriptions(listings, page) {    //FUNCTION TO SCRAPE THE DESCRIPTION PAGE OF EACH LISTING...
  try {                                                        //..., UPDATE THE LISTING VALUES, AND RETURN AN ARRAY OF UPDATED LISTINGS
    for (var i = 0; i < listings.length; i++) {                //loop through every listing in "listings"
      console.log(listings.length - i);
      await page.goto(listings[i].url);                        //access the "url" for each listing
      const html = await page.content();
      const $ = cheerio.load(html);
      const daysAgoElement = $(".timeago").first();
      const specsElements = $(".shared-line-bubble");
      listings[i].daysAgo = daysAgo(listings[i], daysAgoElement);
      listings[i].address = $("div.mapaddress").text();
      listings[i].specs = $format($, specsElements);
      const random = (Math.random() + 0.5) * 1000;            //0.5 - 1.499... seconds
      await sleep(random);                                    //buffer in order to prevent being blocked from craigslist
    }
    return listings;
  } catch {
    console.log(err);                                         //log error if scraping listings' descriptions fails
    process.exit(0);
  }
}

function daysAgo(listing, daysAgoElement) {                         //FUNCTION TO PARSE A CLASS ".timeago" ELEMENT AND RETURN...
  const daysAgo = daysAgoElement.text();                            //...THE "daysAgo" THAT THE LISTING WAS POSTED
  if (!daysAgo.includes("day") && zeroDays(listing.timePosted)) {   //if the listing was posted today
    return 0;
  } else if (daysAgo.match(/\d+/) === null) {                       //else if the listing was posted a day ago
    return 1;
  } else {
    return Number(daysAgo.match(/\d+/).toString());                 //else the listing was posted more than a day ago
  }
}

function zeroDays(date) {                                           //FUNCTION TO RETURN TRUE IF THE DIFFERENCE BETWEEN TWO DATES...
  let currDate = new Date();                                        //...IS < 1; RETURNS FALSE OTHERWISE
  const diffTime = Math.abs(currDate - date);                       //difference of milliseconds between the two dates
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));    //difference of days
  if (diffDays === 0) {
    return true;
  }
  return false;
}

function $format($, elements) {                      //FUNCTION TO PARSE THE TEXT OF AN ARRAY OF ELEMENTS...
  try {                                              //...AND RETURN THE TEXT AS STRING, IN THE FORMAT: "text1, text2, text3,..."
    const array = elements.map((index, element) => { //loop through each element of elements
      return $(element).text().toLowerCase();        //return the text string to the map() array
    }).get();
    return array.join(", ");                         //join all the text strings with a comma and a space
  } catch {
    console.log(err);                                //log error if formatting the elements fails
    process.exit(0);
  }
}

async function sleep(miliseconds) {
  return new Promise(resolve => setTimeout(resolve, miliseconds));
}

function sortListings(listings) {                   //FUNCTION TO SORT LISTINGS
  try {
    listings.sort((a, b) => {                       //sort listings by "daysAgo" key value
      return a.daysAgo - b.daysAgo;
    });
    return listings;
  } catch {
    console.log(err);                               //log error if sorting the listings fails
    process.exit(0);
  }
}

async function saveListings(listings) {
  try {
    for (var i = 0; i < listings.length; i++) {       //loop through every single listing in "listings"
      const listingModel = new Listing(listings[i]);  //initialize a mongoose schema "Listing" with the current listing
      await listingModel.save();                      //save the "Listing" to the database
    }
  } catch {
    console.log(err);                                 //log error if saving the listing fails
    process.exit(0);
  }
}
main();
