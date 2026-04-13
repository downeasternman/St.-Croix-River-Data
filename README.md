# St. Croix River Data

A small Progressive Web App that charts **U.S. Geological Survey (USGS)** streamflow and water temperature for the St. Croix River in Maine:

| Series         | Site ID   | Measure                         |
|----------------|-----------|----------------------------------|
| Discharge      | `01021000`| cubic feet per second (ft³/s)    |
| Water temp.    | `01021050`| degrees Fahrenheit (from °C IV) |

You can pick **1 day**, **7 days**, **30 days**, or a **custom start/end date** (within USGS instantaneous limits). Each chart can show a **long-term daily mean** line for the same calendar date, from the USGS [Statistics Service](https://waterservices.usgs.gov/docs/statistics/statistics-details/) (tab-delimited RDB output; statistics are based on approved daily-mean records where available).

The temperature trace is **tinted for swim comfort relative to 70°F** (cooler water reads bluer).

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (Vite proxies USGS requests in development to avoid CORS issues).

## Production build

```bash
npm run build
npm run preview
```

Deploy the contents of `dist/` to any HTTPS static host.

### GitHub Pages (project site)

If your site URL includes the repository name (for example `https://<user>.github.io/St.-Croix-River-Data/`), build with the matching base path:

```bash
npm run build -- --base /St.-Croix-River-Data/
```

Then publish the `dist/` output (for example with the `peaceiris/actions-gh-pages` action or by pushing to a `gh-pages` branch).

## Phone shortcut (Android)

After deploying over HTTPS, open the site in Chrome, use the menu, and choose **Add to Home screen** or **Install app**.

## Data sources

- Instantaneous values: [NWIS IV](https://waterservices.usgs.gov/docs/instantaneous-values/instantaneous-values-details/)
- Daily statistics: [NWIS Statistics](https://waterservices.usgs.gov/docs/statistics/statistics-details/)

Data courtesy of the U.S. Geological Survey.
