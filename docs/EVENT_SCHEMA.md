# Locale Event Schema

Every provider maps its source into this shape before the UI sees it.

```js
{
  id: "provider:stable-id",
  title: "Event name",
  category: "sports | music | festival | food | theater | comedy | family | community | nightlife | other",
  venue: "Venue name",
  lat: 32.7157,
  lng: -117.1611,
  start: "ISO-8601 datetime",
  end: "ISO-8601 datetime or null",
  price: "$25+ | Free | null",
  url: "canonical ticket/details URL or null",
  source: "source/provider name",
  description: "",
  featured: false
}
```

Provider-specific fields should remain inside the provider adapter. The rest of Locale should only consume normalized events.
