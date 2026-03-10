import type { Song } from '@/types/song';

export const SAMPLE_SONGS: Song[] = [
  // --- International: Sweden ---
  { id: 'abba-dancing-queen', artist: 'ABBA', title: 'Dancing Queen', country: 'SE', year: 1976 },
  { id: 'abba-mamma-mia', artist: 'ABBA', title: 'Mamma Mia', country: 'SE', year: 1975 },
  { id: 'abba-the-winner-takes-it-all', artist: 'ABBA', title: 'The Winner Takes It All', country: 'SE', year: 1980 },
  { id: 'roxette-it-must-have-been-love', artist: 'Roxette', title: 'It Must Have Been Love', country: 'SE', year: 1990 },

  // --- International: Australia ---
  { id: 'ac-dc-highway-to-hell', artist: 'AC/DC', title: 'Highway to Hell', country: 'AU', year: 1979 },
  { id: 'ac-dc-thunderstruck', artist: 'AC/DC', title: 'Thunderstruck', country: 'AU', year: 1990 },

  // --- International: UK ---
  { id: 'adele-hello', artist: 'Adele', title: 'Hello', country: 'GB', year: 2015 },
  { id: 'adele-rolling-in-the-deep', artist: 'Adele', title: 'Rolling in the Deep', country: 'GB', year: 2010 },
  { id: 'adele-someone-like-you', artist: 'Adele', title: 'Someone Like You', country: 'GB', year: 2011 },
  { id: 'beatles-hey-jude', artist: 'Beatles', title: 'Hey Jude', country: 'GB', year: 1968 },
  { id: 'beatles-let-it-be', artist: 'Beatles', title: 'Let It Be', country: 'GB', year: 1970 },
  { id: 'beatles-yesterday', artist: 'Beatles', title: 'Yesterday', country: 'GB', year: 1965 },
  { id: 'elton-john-crocodile-rock', artist: 'Elton John', title: 'Crocodile Rock', country: 'GB', year: 1972 },
  { id: 'elton-john-your-song', artist: 'Elton John', title: 'Your Song', country: 'GB', year: 1970 },
  { id: 'george-michael-careless-whisper', artist: 'George Michael', title: 'Careless Whisper', country: 'GB', year: 1984 },
  { id: 'pink-floyd-wish-you-were-here', artist: 'Pink Floyd', title: 'Wish You Were Here', country: 'GB', year: 1975 },
  { id: 'queen-bohemian-rhapsody', artist: 'Queen', title: 'Bohemian Rhapsody', country: 'GB', year: 1975 },
  { id: 'queen-dont-stop-me-now', artist: 'Queen', title: "Don't Stop Me Now", country: 'GB', year: 1978 },
  { id: 'queen-we-are-the-champions', artist: 'Queen', title: 'We Are the Champions', country: 'GB', year: 1977 },
  { id: 'sting-shape-of-my-heart', artist: 'Sting', title: 'Shape of My Heart', country: 'GB', year: 1993 },

  // --- International: Jamaica ---
  { id: 'bob-marley-no-woman-no-cry', artist: 'Bob Marley', title: 'No Woman No Cry', country: 'JM', year: 1974 },

  // --- International: US ---
  { id: 'bon-jovi-its-my-life', artist: 'Bon Jovi', title: "It's My Life", country: 'US', year: 2000 },
  { id: 'bon-jovi-livin-on-a-prayer', artist: 'Bon Jovi', title: "Livin' on a Prayer", country: 'US', year: 1986 },
  { id: 'elvis-presley-cant-help-falling-in-love', artist: 'Elvis Presley', title: "Can't Help Falling in Love", country: 'US', year: 1961 },
  { id: 'elvis-presley-jailhouse-rock', artist: 'Elvis Presley', title: 'Jailhouse Rock', country: 'US', year: 1957 },
  { id: 'frank-sinatra-fly-me-to-the-moon', artist: 'Frank Sinatra', title: 'Fly Me to the Moon', country: 'US', year: 1964 },
  { id: 'frank-sinatra-my-way', artist: 'Frank Sinatra', title: 'My Way', country: 'US', year: 1969 },
  { id: 'guns-n-roses-sweet-child-o-mine', artist: "Guns N' Roses", title: "Sweet Child O' Mine", country: 'US', year: 1987 },
  { id: 'imagine-dragons-believer', artist: 'Imagine Dragons', title: 'Believer', country: 'US', year: 2017 },
  { id: 'john-legend-all-of-me', artist: 'John Legend', title: 'All of Me', country: 'US', year: 2013 },
  { id: 'journey-dont-stop-believin', artist: 'Journey', title: "Don't Stop Believin'", country: 'US', year: 1981 },
  { id: 'lady-gaga-bad-romance', artist: 'Lady Gaga', title: 'Bad Romance', country: 'US', year: 2009 },
  { id: 'lady-gaga-poker-face', artist: 'Lady Gaga', title: 'Poker Face', country: 'US', year: 2008 },
  { id: 'madonna-like-a-prayer', artist: 'Madonna', title: 'Like a Prayer', country: 'US', year: 1989 },
  { id: 'madonna-material-girl', artist: 'Madonna', title: 'Material Girl', country: 'US', year: 1984 },
  { id: 'metallica-enter-sandman', artist: 'Metallica', title: 'Enter Sandman', country: 'US', year: 1991 },
  { id: 'metallica-nothing-else-matters', artist: 'Metallica', title: 'Nothing Else Matters', country: 'US', year: 1991 },
  { id: 'michael-jackson-billie-jean', artist: 'Michael Jackson', title: 'Billie Jean', country: 'US', year: 1982 },
  { id: 'michael-jackson-thriller', artist: 'Michael Jackson', title: 'Thriller', country: 'US', year: 1982 },
  { id: 'nirvana-smells-like-teen-spirit', artist: 'Nirvana', title: 'Smells Like Teen Spirit', country: 'US', year: 1991 },
  { id: 'red-hot-chili-peppers-californication', artist: 'Red Hot Chili Peppers', title: 'Californication', country: 'US', year: 1999 },
  { id: 'whitney-houston-i-will-always-love-you', artist: 'Whitney Houston', title: 'I Will Always Love You', country: 'US', year: 1992 },

  // --- International: Barbados ---
  { id: 'rihanna-umbrella', artist: 'Rihanna', title: 'Umbrella', country: 'BB', year: 2007 },

  // --- International: France ---
  { id: 'daft-punk-get-lucky', artist: 'Daft Punk', title: 'Get Lucky', country: 'FR', year: 2013 },

  // --- International: Germany ---
  { id: 'scorpions-wind-of-change', artist: 'Scorpions', title: 'Wind of Change', country: 'DE', year: 1990 },

  // --- International: US (Tina Turner) ---
  { id: 'tina-turner-simply-the-best', artist: 'Tina Turner', title: 'Simply the Best', country: 'US', year: 1989 },
  { id: 'tina-turner-whats-love-got-to-do', artist: 'Tina Turner', title: "What's Love Got to Do with It", country: 'US', year: 1984 },

  // --- International: Ireland ---
  { id: 'u2-one', artist: 'U2', title: 'One', country: 'IE', year: 1991 },
  { id: 'u2-with-or-without-you', artist: 'U2', title: 'With or Without You', country: 'IE', year: 1987 },

  // --- Polish artists ---
  { id: 'anna-jantar-nic-nie-moze-wiecznie-trwac', artist: 'Anna Jantar', title: 'Nic nie może wiecznie trwać', country: 'PL', year: 1979 },
  { id: 'anna-jantar-tyle-slonca-w-calym-miescie', artist: 'Anna Jantar', title: 'Tyle słońca w całym mieście', country: 'PL', year: 1971 },
  { id: 'bajm-biala-armia', artist: 'Bajm', title: 'Biała armia', country: 'PL', year: 1984 },
  { id: 'bajm-co-mi-panie-dasz', artist: 'Bajm', title: 'Co mi Panie dasz', country: 'PL', year: 1983 },
  { id: 'budka-suflera-jest-taki-samotny-dom', artist: 'Budka Suflera', title: 'Jest taki samotny dom', country: 'PL', year: 1974 },
  { id: 'budka-suflera-takie-tango', artist: 'Budka Suflera', title: 'Takie tango', country: 'PL', year: 1982 },
  { id: 'czeslaw-niemen-dziwny-jest-ten-swiat', artist: 'Czesław Niemen', title: 'Dziwny jest ten świat', country: 'PL', year: 1967 },
  { id: 'czeslaw-niemen-pod-papajem', artist: 'Czesław Niemen', title: 'Pod Papają', country: 'PL', year: 1969 },
  { id: 'doda-nie-daj-sie', artist: 'Doda', title: 'Nie daj się', country: 'PL', year: 2007 },
  { id: 'edyta-gorniak-to-nie-ja', artist: 'Edyta Górniak', title: 'To nie ja', country: 'PL', year: 1994 },
  { id: 'edyta-gorniak-jestem-kobietka', artist: 'Edyta Górniak', title: 'Jestem kobietą', country: 'PL', year: 1997 },
  { id: 'enej-skrzydlate-rece', artist: 'Enej', title: 'Skrzydlate ręce', country: 'PL', year: 2012 },
  { id: 'golec-uorkiestra-sciernisko', artist: 'Golec uOrkiestra', title: 'Ściernisko', country: 'PL', year: 2001 },
  { id: 'happysad-zanim-pojde', artist: 'Happysad', title: 'Zanim pójdę', country: 'PL', year: 2005 },
  { id: 'ich-troje-powiedz', artist: 'Ich Troje', title: 'Powiedz', country: 'PL', year: 2003 },
  { id: 'irena-santor-powracajace-fale', artist: 'Irena Santor', title: 'Powracające fale', country: 'PL', year: 1966 },
  { id: 'kaczmarski-mury', artist: 'Jacek Kaczmarski', title: 'Mury', country: 'PL', year: 1978 },
  { id: 'kayah-testosteron', artist: 'Kayah', title: 'Testosteron', country: 'PL', year: 2007 },
  { id: 'kombi-black-and-white', artist: 'Kombi', title: 'Black and White', country: 'PL', year: 1986 },
  { id: 'kult-polska', artist: 'Kult', title: 'Polska', country: 'PL', year: 1993 },
  { id: 'kult-gdy-nie-ma-dzieci', artist: 'Kult', title: 'Gdy nie ma dzieci', country: 'PL', year: 1988 },
  { id: 'lady-pank-mniej-niz-zero', artist: 'Lady Pank', title: 'Mniej niż zero', country: 'PL', year: 1985 },
  { id: 'lady-pank-zostan-z-nia', artist: 'Lady Pank', title: 'Zostań z nią', country: 'PL', year: 1983 },
  { id: 'lipnicka-piosenka', artist: 'Anita Lipnicka', title: 'Piosenka', country: 'PL', year: 1997 },
  { id: 'lombard-przezyj-to-sam', artist: 'Lombard', title: 'Przeżyj to sam', country: 'PL', year: 1982 },
  { id: 'maanam-kocham-cie-kochanie-moje', artist: 'Maanam', title: 'Kocham cię kochanie moje', country: 'PL', year: 1983 },
  { id: 'maanam-oddechnij', artist: 'Maanam', title: 'O! Nie rób tyle hałasu', country: 'PL', year: 1982 },
  { id: 'maryla-rodowicz-malgoska', artist: 'Maryla Rodowicz', title: 'Małgośka', country: 'PL', year: 1973 },
  { id: 'maryla-rodowicz-kolorowe-jarmarki', artist: 'Maryla Rodowicz', title: 'Kolorowe jarmarki', country: 'PL', year: 1975 },
  { id: 'myslovitz-chlopcy', artist: 'Myslovitz', title: 'Chłopcy', country: 'PL', year: 2002 },
  { id: 'myslovitz-dlaczego-nie', artist: 'Myslovitz', title: 'Dla czego nie', country: 'PL', year: 2002 },
  { id: 'o-n-a-kiedy-powiem-sobie-dosc', artist: 'O.N.A.', title: 'Kiedy powiem sobie dość', country: 'PL', year: 1997 },
  { id: 'perfect-autobiografia', artist: 'Perfect', title: 'Autobiografia', country: 'PL', year: 1981 },
  { id: 'perfect-nie-placz-ewka', artist: 'Perfect', title: 'Nie płacz Ewka', country: 'PL', year: 1981 },
  { id: 'sarsa-naucz-mnie', artist: 'Sarsa', title: 'Naucz mnie', country: 'PL', year: 2015 },
  { id: 'stachursky-dziewczyna-z-zapalakami', artist: 'Stachursky', title: 'Dziewczyna z zapałkami', country: 'PL', year: 1996 },
  { id: 'sylwia-grzeszczak-karuzela', artist: 'Sylwia Grzeszczak', title: 'Karuzela', country: 'PL', year: 2014 },
  { id: 'trubadurzy-znamy-sie-tylko-z-widzenia', artist: 'Trubadurzy', title: 'Znamy się tylko z widzenia', country: 'PL', year: 1967 },
  { id: 'varius-manx-orla-cien', artist: 'Varius Manx', title: 'Orła cień', country: 'PL', year: 1996 },
  { id: 'wilki-son-o-warszawie', artist: 'Wilki', title: 'Son o Warszawie', country: 'PL', year: 1992 },
  { id: 'wolna-grupa-bukowina-nastroje', artist: 'Wolna Grupa Bukowina', title: 'Nastroje', country: 'PL', year: 1976 },
  { id: 'zakopower-boso', artist: 'Zakopower', title: 'Boso', country: 'PL', year: 2008 },
  { id: 'zenek-martyniuk-przez-twe-oczy-zielone', artist: 'Zenek Martyniuk', title: 'Przez Twe oczy zielone', country: 'PL', year: 1996 },
];
