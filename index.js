const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const Listing = require("./model/Listing");


async function connectToMongoDb(){
  const mongoUrl = "mongodb+srv://**YOUR ADMIN**:**YOUR PASSWORD**@cluster0.z4lwg.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";
  await mongoose.connect(mongoUrl, {useNewUrlParser: true, useUnifiedTopology: true});
  console.log("connected to mongodb");
}


async function scrapeListings(page) {
  await page.goto("https://sfbay.craigslist.org/search/scz/apa?postal=95060&max_price=6000&min_bedrooms=3&availabilityMode=0&sale_date=all+dates");
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
    const address = "null";
    const specs = "null"
    return {timePosted, title, address, price, specs, url};
    }).get();
  return listings;      //return an array of objects(house listings)
}


async function sleep(miliseconds) {
  return new Promise(resolve => setTimeout(resolve, miliseconds));
}


async function scrapeDescriptions(listings, page) {
  for (var i = 0; i < listings.length; i++) { //loop through every single listing
    console.log(listings.length-i);
    await page.goto(listings[i].url);         //access the "url" that we scraped in scrapedListings
    const html = await page.content();
    const $ = cheerio.load(html);
    listings[i].address = $("div.mapaddress").text();
      const specs = $(".shared-line-bubble").map((index, element) => { //loop through bed/bath, sqft, etc.
        return $(element).text().toLowerCase(); //return the object to the array created by map()
      }).get();
    listings[i].specs = specs.join(", ");

    const listingModel = new Listing(listings[i]);
    await listingModel.save();


    const random = (Math.random() + 1) * 1000;  //1 - 1.99... seconds
    await sleep(random);
  }
}


async function main() {
  while(true){
  await connectToMongoDb();
  const browser = await puppeteer.launch({
    headless: false
  });

  const page = await browser.newPage();
  const listings = await scrapeListings(page); //Calls listings functions
  const listingsWithDespcriptions = await scrapeDescriptions(listings, page);

  await page.close();
  await browser.close();
  console.log(listings);
  }
}

main();
