const assert = require('assert');
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const Listing = require("./model/Listing");
const pass = require("./pass/pass");
const send = require('gmail-send')({
    user: pass.email,
    pass: pass.ePass,
    to: pass.contacts,
    subject: 'new house',
    text: 'url'});

const dbAdmin = pass.adminUser;
const adminPassword = pass.adminPass;
const logIn = dbAdmin + ":" + adminPassword;
const mongoUrl = "mongodb+srv://"+logIn+"@cluster0.z4lwg.mongodb.net/dbOne?retryWrites=true&w=majority";  //MongoDB Atlas account connection
const housingPageURL = "https://sfbay.craigslist.org/search/scz/apa?postal=95060&availabilityMode=0&sale_date=all+dates"; //Craigslist housing page to be scraped
const random = (Math.random() + 0.4) * 1000;                              //0.4 - 1.399... seconds


async function main() {                                                   //MAIN FUNCTION OF THE PROGRAM
  await connectToMongoDb();
  const browser = await puppeteer.launch({ headless: true });
  while (true) {
    try {
      await sleep(random);
      const page = await browser.newPage();
      let prevListings = await getCollection(Listing);                    //drop the current "listings" collection and return its contents
      prevListings = await removeID(prevListings);
      let listings = await scrapeListings(page);                          //scrape the "housing home page" listings
      let newListings = await difference(listings, prevListings);         //find new house listings that don't exist in the "prevListings"...
      if(newListings.length == 0 && prevListings.length != 0) {           //...but exist in "listings"
        console.log("no new postings");
      } else if (newListings.length != 0 && prevListings.length != 0){    //if there are new listings and this is not the first iteration...
        console.log("NEW Postings:");                                     //...of the program
        newListings = await scrapeListingsDescriptions(newListings, page);//scrape the descriptions of each of the new listing
        newListings = filterReposts(newListings);                         //remove old reposts to find newListings
        if(newListings.length == 0) {                                     //if all newListings are reposts
          console.log("no new listings");
          continue;
        } else {
          console.log("NEW LISTINGS", newListings);
          await sendListings(newListings);                              //send the the new listings via text/email
          console.log("ALL listings:");
          listings = await scrapeListingsDescriptions(listings, page);
          listings = await sortListings(listings);                      //sort listings by "daysAgo" posted (newest first)
          console.log("listings", listings);
          await Listing.collection.drop();                              //drop the current db collection
          await saveListings(listings);                                 //save the updated listings into the db collection
        }
      } else {
        console.log("ALL listings:");                                   //"first iteration" case of the program
        listings = await scrapeListingsDescriptions(listings, page);
        listings = await sortListings(listings);
        console.log("listings", listings);
        await saveListings(listings);
      }
      await page.close();
      console.log("\n");
    } catch(err) {                                  //if main() function fails
      const {result,full} = await send({            //send error message
        subject: "Program Stopped (Error)",
        text: "" + err
      });
      console.log(result);
      console.log(err);
      await page.close();
      await browser.close();
      await mongoose.connection.close();
      process.exit(0);
    }
  }
}

async function sleep(miliseconds) {
  return new Promise(resolve => setTimeout(resolve, miliseconds));
}

async function connectToMongoDb() {                 //FUNCTION TO CONNECT TO MONGODB
  try {
      await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    console.log("connected to mongodb");
  } catch(err) {                                    //log error if connection fails
    console.log(err);
  }
}

async function getCollection(model) {               //FUNCTION TO RETURN ALL ITEMS OF A DB COLLECTION AS AN ARRAY
  console.log("fetching previous listings...")
  let collection = []
  try {
    collection = await Listing.find({});            //find all items of a collection
  } catch(err) {
    console.log(err);
    collection = [];                                //if error, collection is empty
  } finally {
    return collection;
  }
}

async function removeID(listings){                  //FUNCTION THAT REMOVES A KEY FROM AN ARRAY OF OBJECTS
  try{
    for(var i = 0; i < listings.length; i++) {      //for every object in array
        await delete listings[i]._id;               //remove the key
    }
    return listings;
  }catch(err){
    console.log(err);                               //log error if key removal fails
  }
}

async function scrapeListings(page) {                             //FUNCTION TO SCRAPE LISTINGS FROM THE CRAIGSLIST HOUSING, MAIN PAGE...
  console.log("scraping listings page...");                       //...AND RETURN THE LISTINGS AS AN ARRAY OF OBJECTS
  let listings = [];
  try {
    await page.goto(housingPageURL);                              //access a craiglist housing page via url
    const html = await page.content();
    const $ = cheerio.load(html);
    listings = $(".result-info").map((index, element) => {        //loop through all listings via "result-info" element and store...
      const timeElement = $(element).find(".result-date");        //...each return value in an array
      const titleElement = $(element).find(".result-title");      //query the html page for all the desired elements
      const resultPriceElement = $(element).find(".result-meta").find(".result-price");
      const timePosted = new Date($(timeElement).attr("datetime"));
      const timeFormat = $(timeElement).attr("title");
      const daysAgo = "-1";
      const title = $(titleElement).text();
      const address = "N/A";
      const price = $(resultPriceElement).text();
      const url = $(titleElement).attr("href");
      const specs = "N/A";
      title.trim();
      timeFormat.trim();
      price.trim();
      return {                                    //return the listing with its scraped values
        timePosted,
        timeFormat,
        daysAgo,
        title,
        address,
        price,
        specs,
        url
      };
    }).get();
  } catch(err) {
    console.log(err);                             //log error if scraping listings fails
    console.log("err entered");
    listings = [];
  } finally {
    return listings;                              //return the array of scraped listings
  }
}

function difference(listings, prevListings) {     //FUNCTION TO RETURN ALL LISTINGS THAT EXIST IN "listings"...
  console.log("comparing...");                    //...BUT NOT IN "prevListings"
  return listings.filter(listing => {
    return prevListings.filter(prevL => {
      return prevL.title == listing.title
      }).length == 0;
    });
  }

async function scrapeListingsDescriptions(listings, page) {    //FUNCTION TO SCRAPE THE "DESCRIPTION PAGE" OF EACH LISTING...
  console.log("scraping descriptions...");                     //..., UPDATE THE LISTING VALUES, AND RETURN AN ARRAY OF UPDATED LISTINGS
  try {
    for (var i = 0; i < listings.length; i++) {                //loop through every listing in "listings"
      console.log(listings.length - i);
      await page.goto(listings[i].url);                        //access the "url" for each listing
      const html = await page.content();
      const $ = cheerio.load(html);
      const daysAgoElement = $(".timeago").first();            //query the desired html elements
      const specsElements = $(".shared-line-bubble");
      listings[i].daysAgo = daysAgo(listings[i], daysAgoElement);
      listings[i].address = $("div.mapaddress").text();
      listings[i].specs = $format($, specsElements);
      await sleep(random);                                     //buffer in order to prevent being blocked from craigslist
    }
    return listings;
  } catch(err) {
    console.log(err);                                          //log error if scraping listings' descriptions fails
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
  } catch(err) {
    console.log(err);                                //log error if formatting the elements fails
  }
}

function filterReposts(listings) {
  let newListings = [];
  for(var i = 0; i < listings.length; i++) {
    if(listings[i].daysAgo === 0){
      newListings.push(listings[i]);
    }
  }
  return newListings;
}

function sortListings(listings) {                   //FUNCTION TO SORT LISTINGS by "daysAgo" key value
  console.log("sorting...");
  try {
    listings.sort((a, b) => {                       //sort listings by "daysAgo" key value
      return a.daysAgo - b.daysAgo;
    });
    return listings;
  } catch(err) {
    console.log(err);                               //log error if sorting the listings fails
  }
}

async function saveListings(listings) {
  console.log("saving...");
  try {
    for (var i = 0; i < listings.length; i++) {       //loop through every single listing in "listings"
      const listingModel = new Listing(listings[i]);  //initialize a mongoose schema "Listing" with the current listing
      await listingModel.save();                      //save the "Listing" to the database
    }
  } catch(err) {
    console.log(err);                                 //log error if saving the listing fails
  }
}

async function sendListings(listings) {
  console.log("sending...");
  try{
    for(var i = listings.length-1; i >= 0; i--) {     //send each listing from oldest to newest
      const bar = "\n_______________________  ";
      const dashes = "\n---------------------- ";
      const timeFormat = "\n " + listings[i].timeFormat + " ";
      const title = "\n[" + listings[i].title + "]";
      const address = "\n| " + listings[i].address;
      const price = "\n| " + listings[i].price;
      const specs = "\n| " + listings[i].specs;
      const url = "\n" + listings[i].url;
      const message = bar + title + dashes + address + price + specs + url;
      const sent = await send({
        subject: timeFormat,
        text: message
      });
      console.log(sent.result);
      // const sent = await send({
      //   subject: timeFormat,
      //   text: url
      // });
      // console.log(sent.result);
    }
  }catch(err) {
    console.log(err)                                  //leg error if sending a message fails
  }
}

main();
