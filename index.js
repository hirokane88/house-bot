const puppeteer = require("puppeteer");
const cheerio = require("cheerio");


async function scrapeListings(page) {
    await page.goto("https://sfbay.craigslist.org/search/scz/apa?postal=95060&max_price=6000&min_bedrooms=3&availabilityMode=0&sale_date=all+dates");
    const html = await page.content();
    const $ = cheerio.load(html);

    const listings = $(".result-info").map((index, element)=>{
      const titleElement = $(element).find(".result-title");
      const timeElement = $(element).find(".result-date");
      const resultPriceElement = $(element).find(".result-meta").find(".result-price");
      const title = $(titleElement).text();
      const url = $(titleElement).attr("href");
      const datePosted = new Date($(timeElement).attr("datetime"));
      const price = $(resultPriceElement).text();
      title.trim();
      return { datePosted, title, url, price };
    }).get();
    return listings;
}

async function main() {
    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();
    const listings = await scrapeListings(page);
    console.log(listings);
}

main();
