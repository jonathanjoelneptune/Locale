// Regional geometry constraints live outside the generic area resolver.
// Coordinates are [longitude, latitude]. The San Diego land mask is a
// simplified GSHHS intermediate-resolution coastline clipped to Locale's
// configured San Diego coverage envelope. It prevents generated area cells
// from extending into the Pacific and follows the major San Diego Bay coast.
export const AREA_GEOMETRY_CONSTRAINTS={
  "san-diego":{
    source:"GSHHS intermediate-resolution coastline with Locale curated overrides",
    landMask:[
      [-117.112446,32.45],
      [-117.120834,32.468887],
      [-117.138306,32.620888],
      [-117.180862,32.681946],
      [-117.228363,32.687248],
      [-117.223526,32.708252],
      [-117.19178,32.716614],
      [-117.16375,32.698891],
      [-117.167442,32.678833],
      [-117.154167,32.680664],
      [-117.12178,32.603722],
      [-117.098221,32.615143],
      [-117.100891,32.629417],
      [-117.120087,32.673553],
      [-117.174141,32.709747],
      [-117.17878,32.727669],
      [-117.225807,32.725029],
      [-117.247002,32.667473],
      [-117.254219,32.783279],
      [-117.283249,32.831833],
      [-117.252472,32.880081],
      [-117.281776,33.008835],
      [-117.332443,33.125],
      [-117.435028,33.25425],
      [-117.507889,33.332138],
      [-117.599388,33.384247],
      [-117.655502,33.444862],
      [-117.7,33.455107],
      [-117.7,33.5],
      [-116.3,33.5],
      [-116.3,32.45],
      [-117.112446,32.45]
    ],
    overrides:{
      // Coronado needs geographic identity rather than a nearest-center wedge.
      // This corridor covers North Island, Coronado and the Silver Strand, then
      // gets intersected with the land mask before it replaces the generated cell.
      coronado:{
        source:"Locale curated Coronado land override",
        mask:[
          [-117.226,32.716],
          [-117.198,32.721],
          [-117.172,32.713],
          [-117.158,32.7],
          [-117.158,32.681],
          [-117.151,32.659],
          [-117.141,32.633],
          [-117.129,32.603],
          [-117.121,32.575],
          [-117.146,32.568],
          [-117.16,32.604],
          [-117.175,32.637],
          [-117.196,32.66],
          [-117.215,32.676],
          [-117.226,32.695],
          [-117.226,32.716]
        ]
      }
    }
  }
};

export const areaGeometryConstraints=regionId=>AREA_GEOMETRY_CONSTRAINTS[regionId]||null;
