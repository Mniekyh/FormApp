const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

const nodemailer = require('nodemailer');
const webpush = require('web-push');
const sqlite3 = require('sqlite3');



const PORT = 3000;
const https = require('https');
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


const bcrypt = require('bcrypt');
const saltRounds = 10;


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));





// Ustaw klucze VAPID (musisz je wcześniej wygenerować)
webpush.setVapidDetails(
    'mailto:naughtylius@o2.pl',
    'BLht_0mpJxGjR9mG0a_CUNflW0gEaAE0Qy59jyBoC-sqAM3jLDpdEaImHQYXbZZL7PqNWj9MEtQOJg43hcneiN8',
    'Bvupoz_593SAz8qWP3cMjeAWRZFbfPkKyydSfysgDgc'
);

function sendPushNotification(subscription, payload) {
    webpush.sendNotification(subscription, JSON.stringify(payload))
        .then(response => {
            console.log('✅ Powiadomienie wysłane');
        })
        .catch(err => {
            console.error('❌ Błąd przy wysyłaniu push:', err);
        });
}

// Konfiguracja sesji
app.use(session({
    secret: 'twoj-sekret', // Zmien na unikalny sekret, może być długi ciąg znaków
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true } // Zmien na true, jeśli masz HTTPS
}));






app.use(express.json());

app.use((req, res, next) => {
    // Sprawdzanie, czy sesja istnieje
    if (req.session && req.session.user) {
        res.locals.user = req.session.user; // Przekazanie danych użytkownika do wszystkich widoków
    } else {
        res.locals.user = null; // Brak użytkownika, jeśli sesja nie istnieje
    }
    next();
});






// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.set('view engine', 'ejs');

app.use(session({
    secret: 'tajnehaslo',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // Sesja trwa 24 godziny
}));


//nodeKey
webpush.setVapidDetails(
    'mailto:anvil.Smithy@gmail.com',
    'BDuwKR-rrooxTxsIraHgkdpZNOxr1Oef8uGIM-Bg6-LSoTZtTo0IXYgFVaV3DsF7sz5rTcHZnt5fLdlyIqZ_2zQ',
    'T_d3pq4VZoxpOfrwvHK-sMYppAz_BbASRJVR2kAQ0Uw'
);








function isLoggedIn(req) {
    return req.session && req.session.user;
}

// Multer - konfiguracja uploadów
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, './uploads/'); // Upewnij się, że masz katalog "uploads"
    },
    filename: function(req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // np. 1712344323.pdf
    }
});
const upload = multer({ storage: storage });

// Tworzenie tabel, jeśli nie istnieją
db.run(`
    CREATE TABLE IF NOT EXISTS Ticket (
        Id_ticket INTEGER PRIMARY KEY AUTOINCREMENT,
        Id_sprawa INTEGER,
        Id_uzytkownik INTEGER,
        Tresc TEXT,
        Data DATETIME DEFAULT CURRENT_TIMESTAMP,
        Typ TEXT,
        FOREIGN KEY(Id_sprawa) REFERENCES Sprawa(Id_sprawa),
        FOREIGN KEY(Id_uzytkownik) REFERENCES Uzytkownik(id)
    )
`);
db.run(`
    CREATE TABLE IF NOT EXISTS Zalacznik (
        Id_zalacznik INTEGER PRIMARY KEY AUTOINCREMENT,
        Id_sprawa INTEGER,
        nazwa_pliku TEXT,
        data_dodania DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(Id_sprawa) REFERENCES Sprawa(Id_sprawa)
    )
`);

// Autoryzacja



// ✅ Rejestracja - działa z sqlite3
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async(req, res) => {
    const { imie, nazwisko, email, haslo, rola } = req.body;
    try {
        db.get('SELECT * FROM Uzytkownik WHERE email = ?', [email], async(err, existingUser) => {
            if (err) {
                console.error('❌ Błąd przy sprawdzaniu użytkownika:', err);
                return res.status(500).send('Błąd serwera');
            }
            if (existingUser) {
                return res.status(400).send('❌ Użytkownik z tym adresem email już istnieje.');
            }

            const hashedPassword = await bcrypt.hash(haslo, saltRounds);

            db.run('INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, rola) VALUES (?, ?, ?, ?, ?)', [imie, nazwisko, email, hashedPassword, rola],
                function(err) {
                    if (err) {
                        console.error('❌ Błąd przy rejestracji:', err);
                        return res.status(500).send('Błąd przy rejestracji');
                    }
                    res.redirect('/login');
                }
            );
        });
    } catch (err) {
        console.error('❌ Błąd podczas rejestracji:', err);
        res.status(500).send('Błąd serwera podczas rejestracji');
    }
});

// ✅ Logowanie - działa z sqlite3
app.get('/login', (req, res) => res.render('login'));

app.post('/login', async(req, res) => {
    const { email, haslo } = req.body;
    try {
        db.get('SELECT * FROM Uzytkownik WHERE email = ?', [email], async(err, user) => {
            if (err) {
                console.error('❌ Błąd przy szukaniu użytkownika:', err);
                return res.status(500).send('Błąd serwera');
            }
            if (!user) {
                return res.send('Nieprawidłowy login lub hasło');
            }

            const passwordMatch = await bcrypt.compare(haslo, user.haslo);

            if (passwordMatch) {
                req.session.user = {
                    id: user.id,
                    imie: user.imie,
                    nazwisko: user.nazwisko,
                    email: user.email,
                    rola: user.rola,
                    push_subscription: user.push_subscription
                };
                res.redirect('/');
            } else {
                res.send('Nieprawidłowy login lub hasło');
            }
        });
    } catch (err) {
        console.error('❌ Błąd podczas logowania:', err);
        res.status(500).send('Błąd serwera podczas logowania');
    }
});

// ✅ Rejestracja - z haszowaniem hasła
// app.get('/register', (req, res) => res.render('register'));

// app.post('/register', async(req, res) => {
//     const { imie, nazwisko, email, haslo, rola } = req.body;
//     try {
//         const existingUser = db.prepare('SELECT * FROM Uzytkownik WHERE email = ?').get(email);

//         if (existingUser) {
//             return res.status(400).send('❌ Użytkownik z tym adresem email już istnieje.');
//         }

//         const hashedPassword = await bcrypt.hash(haslo, saltRounds);

//         db.run('INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, rola) VALUES (?, ?, ?, ?, ?)', [imie, nazwisko, email, hashedPassword, rola], function(err) {
//             if (err) return res.send('Błąd przy rejestracji: ' + err.message);
//             res.redirect('/login');
//         });
//     } catch (err) {
//         console.error('❌ Błąd podczas rejestracji:', err);
//         res.status(500).send('Błąd serwera podczas rejestracji');
//     }
// });

// // ✅ Logowanie - z porównywaniem haszowanego hasła
// app.get('/login', (req, res) => res.render('login'));

// app.post('/login', async(req, res) => {
//     const { email, haslo } = req.body;
//     try {
//         const user = db.prepare('SELECT * FROM Uzytkownik WHERE email = ?').get(email);

//         if (!user) {
//             return res.send('Nieprawidłowy login lub hasło');
//         }

//         const passwordMatch = await bcrypt.compare(haslo, user.haslo);

//         if (passwordMatch) {
//             req.session.user = {
//                 id: user.id,
//                 imie: user.imie,
//                 nazwisko: user.nazwisko,
//                 email: user.email,
//                 rola: user.rola
//             };
//             res.redirect('/');
//         } else {
//             res.send('Nieprawidłowy login lub hasło');
//         }
//     } catch (err) {
//         console.error('❌ Błąd podczas logowania:', err);
//         res.status(500).send('Błąd serwera podczas logowania');
//     }
// });


app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Błąd przy wylogowaniu:', err);
            return res.status(500).send('Błąd przy wylogowaniu');
        }
        res.redirect('/login');
    });
});


app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('Błąd podczas wylogowania');
        res.redirect('/login');
    });
});

// Strona główna
app.get('/', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const data = {};
    const user = req.session.user;

    const allowedColumns = ['Id_sprawa', 'Imie', 'Nazwisko', 'Id_kategoria', 'Adres', 'Telefon', 'Mail', 'Opis', 'Stan', 'Id_agent'];
    const sortColumn = allowedColumns.includes(req.query.sort) ? req.query.sort : 'Id_sprawa';
    const sortOrder = req.query.order === 'desc' ? 'DESC' : 'ASC';

    db.all('SELECT * FROM Agent', [], (err, agents) => {
        if (err) return res.status(500).send(err.message);
        data.agents = agents;

        db.all('SELECT * FROM Kategoria', [], (err, categories) => {
            if (err) return res.status(500).send(err.message);
            data.categories = categories;

            const query = user.rola === 'ubezpieczony' ?
                `SELECT * FROM Sprawa WHERE Id_uzytkownik = ? ORDER BY ${sortColumn} ${sortOrder}` :
                `SELECT * FROM Sprawa ORDER BY ${sortColumn} ${sortOrder}`;

            const params = user.rola === 'ubezpieczony' ? [user.id] : [];

            db.all(query, params, async(err, sprawy) => {
                if (err) return res.status(500).send(err.message);

                const sprawyPromises = sprawy.map(sprawa => {
                    return new Promise((resolve, reject) => {
                        db.all(`
                            SELECT Ticket.*, Uzytkownik.imie || ' ' || Uzytkownik.nazwisko AS Autor
                            FROM Ticket
                            LEFT JOIN Uzytkownik ON Ticket.Id_uzytkownik = Uzytkownik.id
                            WHERE Ticket.Id_sprawa = ?
                            ORDER BY Ticket.Data DESC
                        `, [sprawa.Id_sprawa], (err, tickets) => {
                            if (err) return reject(err);

                            db.all(`SELECT * FROM Zalacznik WHERE Id_sprawa = ?`, [sprawa.Id_sprawa], (err, zalaczniki) => {
                                if (err) return reject(err);

                                sprawa.tickets = tickets;
                                sprawa.zalaczniki = zalaczniki || [];
                                resolve(sprawa);
                            });
                        });
                    });
                });

                Promise.all(sprawyPromises)
                    .then(sprawyWithTickets => {
                        data.sprawy = sprawyWithTickets;
                        data.user = user;
                        data.sortColumn = sortColumn;
                        data.sortOrder = sortOrder;
                        res.render('index', data);
                    })
                    .catch(err => res.status(500).send("Błąd przy pobieraniu historii"));
            });
        });
    });
});

// Strona pojedynczej sprawy
app.get('/sprawa/:id', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const id = req.params.id;
    db.get('SELECT * FROM Sprawa WHERE Id_sprawa = ?', [id], (err, sprawa) => {
        if (err) return res.status(500).send('Błąd serwera');
        if (!sprawa) return res.status(404).send('Nie znaleziono sprawy');

        // Pobieramy też tickety i załączniki do tej sprawy
        db.all(`
            SELECT Ticket.*, Uzytkownik.imie || ' ' || Uzytkownik.nazwisko AS Autor
            FROM Ticket
            LEFT JOIN Uzytkownik ON Ticket.Id_uzytkownik = Uzytkownik.id
            WHERE Ticket.Id_sprawa = ?
            ORDER BY Ticket.Data DESC
        `, [id], (err, tickets) => {
            if (err) return res.status(500).send('Błąd serwera przy ładowaniu ticketów');

            db.all('SELECT * FROM Zalacznik WHERE Id_sprawa = ?', [id], (err, zalaczniki) => {
                if (err) return res.status(500).send('Błąd serwera przy ładowaniu załączników');

                res.render('sprawa', {
                    user: req.session.user,
                    sprawa,
                    tickets,
                    zalaczniki
                });
            });
        });
    });
});


// Dodanie zgłoszenia
app.post('/zgloszenie', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const { Imie, Nazwisko, Adres, Telefon, Mail, Opis } = req.body;
    const userId = req.session.user.id;

    db.run(`
        INSERT INTO Sprawa 
        (Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent, Id_uzytkownik) 
        VALUES (?, ?, NULL, ?, ?, ?, ?, 'Oczekuje', NULL, ?)
    `, [Imie, Nazwisko, Adres, Telefon, Mail, Opis, userId], (err) => {
        if (err) return res.status(500).send("Błąd przy dodawaniu zgłoszenia");
        res.redirect('/');
    });
});

//usuwanie sprawy

app.post('/sprawa/:id/usun', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const user = req.session.user;
    const { id } = req.params;

    if (user.rola === 'ubezpieczony') {
        return res.status(403).send('❌ Brak uprawnień do usuwania spraw.');
    }

    // Najpierw usuń załączniki
    db.all('SELECT Nazwa_pliku FROM Zalacznik WHERE Id_sprawa = ?', [id], (err, files) => {
        if (err) {
            console.error('Błąd przy pobieraniu załączników:', err);
            return res.status(500).send('Błąd serwera.');
        }

        for (const file of files) {
            const filePath = path.join(__dirname, 'uploads', file.Nazwa_pliku);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Usuń rekordy z Zalacznik i Ticket
        db.run('DELETE FROM Zalacznik WHERE Id_sprawa = ?', [id], (err) => {
            if (err) console.error('Błąd przy usuwaniu załączników:', err);

            db.run('DELETE FROM Ticket WHERE Id_sprawa = ?', [id], (err) => {
                if (err) console.error('Błąd przy usuwaniu ticketów:', err);

                // Na końcu usuń sprawę
                db.run('DELETE FROM Sprawa WHERE Id_sprawa = ?', [id], (err) => {
                    if (err) {
                        console.error('Błąd przy usuwaniu sprawy:', err);
                        return res.status(500).send('Błąd serwera przy usuwaniu sprawy.');
                    }

                    res.redirect('/');
                });
            });
        });
    });
});


// Edycja sprawy
app.post('/sprawa/edytuj/:id', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'ubezpieczyciel') {
        return res.status(403).send('Brak uprawnień');
    }

    const { Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent } = req.body;
    const id = req.params.id;

    db.get('SELECT * FROM Sprawa WHERE Id_sprawa = ?', [id], (err, oldSprawa) => {
        if (err || !oldSprawa) return res.status(500).send("Błąd przy pobieraniu starej wersji sprawy");

        db.run(`
            UPDATE Sprawa SET 
                Imie = ?, Nazwisko = ?, Id_kategoria = ?, Adres = ?, Telefon = ?, Mail = ?, 
                Opis = ?, Stan = ?, Id_agent = ? 
            WHERE Id_sprawa = ?
        `, [Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent, id], function(err) {
            if (err) return res.status(500).send("Błąd przy edycji sprawy");

            const zmiany = [];
            if (oldSprawa.Stan !== Stan) zmiany.push(`Status: ${oldSprawa.Stan} → ${Stan}`);
            if (oldSprawa.Id_agent !== Number(Id_agent)) zmiany.push(`Agent: ${oldSprawa.Id_agent ?? 'Brak'} → ${Id_agent || 'Brak'}`);

            if (zmiany.length) {
                const tresc = zmiany.join(', ');
                const idUzytkownik = req.session.user.id;

                db.run(`
                    INSERT INTO Ticket (Id_sprawa, Tresc, Data, Typ, Id_uzytkownik)
                    VALUES (?, ?, datetime('now'), ?, ?)
                `, [id, tresc, 'Automatyczna zmiana', idUzytkownik], err => {
                    if (err) console.error("Błąd zapisu ticketa:", err.message);
                    res.redirect('/');
                });
            } else {
                res.redirect('/');
            }
        });
    });
});

// Wysyłanie nowej wiadomości (ticket)
app.post('/sprawa/:id/wiadomosc', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const idSprawa = req.params.id;
    const { tresc } = req.body;
    const idUzytkownik = req.session.user.id;

    db.run('INSERT INTO Ticket (Id_sprawa, Id_uzytkownik, Tresc, Data) VALUES (?, ?, ?, ?)', [idSprawa, idUzytkownik, tresc, new Date().toISOString()],
        (err) => {
            if (err) return res.status(500).send('Błąd przy dodawaniu wiadomości');
            res.redirect('/sprawa/' + idSprawa);
        });
});


// Wgrywanie załącznika
app.post('/sprawa/:id/zalacznik', upload.single('zalacznik'), (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const idSprawa = req.params.id;
    const file = req.file;
    if (!file) return res.status(400).send('Brak pliku');

    db.run('INSERT INTO Zalacznik (Id_sprawa, Nazwa_pliku, Sciezka) VALUES (?, ?, ?)', [idSprawa, file.originalname, file.filename],
        (err) => {
            if (err) {
                console.error(err); // <-- Dodaj to żeby widzieć szczegóły błędu w konsoli
                return res.status(500).send('Błąd przy dodawaniu załącznika');
            }
            res.redirect('/sprawa/' + idSprawa);
        });
});



// Usuwanie załącznika
app.post('/sprawa/:id/usun-zalacznik/:zalacznikId', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const { id, zalacznikId } = req.params;

    db.get('SELECT Nazwa_pliku FROM Zalacznik WHERE Id_zalacznik = ?', [zalacznikId], (err, zalacznik) => {
        if (err) {
            console.error('Błąd przy pobieraniu pliku:', err);
            return res.status(500).send('Błąd serwera przy pobieraniu załącznika');
        }

        if (!zalacznik) {
            console.warn('Załącznik nie istnieje w bazie.');
            return res.redirect('/sprawa/' + id); // Po prostu wróć bez błędu
        }

        const filePath = path.join(__dirname, 'uploads', zalacznik.Nazwa_pliku);

        fs.unlink(filePath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.warn('Błąd przy usuwaniu pliku:', err.message);
            }

            db.run('DELETE FROM Zalacznik WHERE Id_zalacznik = ?', [zalacznikId], (err) => {
                if (err) {
                    console.error('Błąd przy usuwaniu z bazy:', err);
                    return res.status(500).send('Błąd serwera przy usuwaniu załącznika');
                }
                res.redirect('/sprawa/' + id);
            });
        });
    });
});




//AGENT
// Panel Agenta - sprawy przypisane do zalogowanego agenta
app.get('/panel-agent', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak dostępu');
    }

    const agentId = req.session.user.id;
    db.all(`
        SELECT * FROM Sprawa
        WHERE Id_agent = ?

    `, [agentId], (err, sprawy) => {
        if (err) return res.status(500).send('Błąd pobierania spraw');

        // Dla każdej sprawy pobieramy tickety
        const sprawyPromises = sprawy.map(sprawa => {
            return new Promise((resolve, reject) => {
                db.all(`
                    SELECT Ticket.*, Uzytkownik.imie || ' ' || Uzytkownik.nazwisko AS Autor
                    FROM Ticket
                    LEFT JOIN Uzytkownik ON Ticket.Id_uzytkownik = Uzytkownik.id
                    WHERE Ticket.Id_sprawa = ?
                    ORDER BY Ticket.Data DESC
                `, [sprawa.Id_sprawa], (err, tickets) => {
                    if (err) reject(err);
                    sprawa.tickets = tickets;
                    resolve(sprawa);
                });
            });
        });

        Promise.all(sprawyPromises)
            .then(sprawyWithTickets => {
                res.render('panel-agent', {
                    user: req.session.user,
                    sprawy: sprawyWithTickets
                });
            })
            .catch(err => res.status(500).send("Błąd przy pobieraniu ticketa"));
    });
});


app.get('/agent/sprawa/:id', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak uprawnień');
    }

    const sprawaId = req.params.id;

    db.all('SELECT * FROM Ticket WHERE Id_sprawa = ?', [sprawaId], (err, tickets) => {
        if (err) {
            console.error("Błąd pobierania ticketów:", err.message);
            return res.status(500).send("Błąd przy pobieraniu ticketów");
        }

        // Pobierz dane sprawy
        db.get('SELECT * FROM Sprawa WHERE Id_sprawa = ?', [sprawaId], (err, sprawa) => {
            if (err || !sprawa) {
                console.error("Błąd pobierania sprawy:", err.message);
                return res.status(500).send("Błąd przy pobieraniu sprawy");
            }

            sprawa.tickets = tickets; // Przypisz pobrane tickety do sprawy

            res.render('panel-agent', { sprawa });
        });
    });
});

app.post('/agent/sprawa/:id/ticket', (req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak uprawnień');
    }

    const sprawaId = req.params.id;
    const { Tresc, Typ } = req.body;

    // Dodaj nowy ticket
    db.run(`
        INSERT INTO Ticket (Id_sprawa, Id_uzytkownik, Tresc, Typ) 
        VALUES (?, ?, ?, ?)
    `, [sprawaId, req.session.user.id, Tresc, Typ], function(err) {
        if (err) {
            console.error("Błąd dodawania ticketa:", err.message);
            return res.status(500).send("Błąd przy dodawaniu ticketa");
        }
        res.redirect(`/panel-agent`);
    });
});

// Zmiana stanu sprawy
app.post('/sprawa/:id/zmien-stan', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const user = req.session.user;
    const { id } = req.params;
    const { nowy_stan, komentarz } = req.body;

    if (user.rola === 'ubezpieczony') {
        return res.status(403).send('❌ Brak uprawnień do zmiany stanu sprawy.');
    }

    db.run('UPDATE Sprawa SET Stan = ? WHERE Id_sprawa = ?', [nowy_stan, id], (err) => {
        if (err) {
            console.error('Błąd przy aktualizacji stanu:', err);
            return res.status(500).send('Błąd serwera przy zmianie stanu');
        }

        if (komentarz && komentarz.trim() !== '') {
            const data = new Date().toISOString();
            db.run('INSERT INTO Ticket (Id_sprawa, Id_uzytkownik, Tresc, Data) VALUES (?, ?, ?, ?)', [id, user.id, `Komentarz do zmiany stanu: ${komentarz}`, data], (err) => {
                if (err) {
                    console.error('Błąd przy zapisie komentarza:', err);
                    // nawet jeśli komentarz się nie zapisze, przekieruj użytkownika
                }
                res.redirect('/sprawa/' + id);
            });
        } else {
            res.redirect('/sprawa/' + id);
        }
    });
});



app.get('/panel-agent/sprawa/:id', async(req, res) => {
    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak dostępu');
    }

    const agentId = req.session.user.id;
    const sprawaId = req.params.id;

    try {
        // Pobieramy szczegóły sprawy z bazy danych
        const sprawa = await db.get("SELECT * FROM Sprawa WHERE Id_sprawa = ? AND Id_agent = ?", [sprawaId, agentId]);

        if (!sprawa) {
            return res.status(404).send('Sprawa nie znaleziona');
        }

        // Renderowanie strony z danymi sprawy (zakładam, że masz widok w EJS)
        res.redirect(`/panel-agent/`);
    } catch (err) {
        console.error('Błąd podczas ładowania sprawy:', err);
        res.status(500).send("Błąd przy ładowaniu danych sprawy");
    }
});


// Ścieżka do aktualizacji statusu sprawy na podstawie Id_ticket
app.post('/agent/update-status', (req, res) => {
    const { changeStatus, stan, Id_ticket } = req.body; // Pobieramy Id_ticket z formularza

    if (!isLoggedIn(req) || req.session.user.rola !== 'agent') {
        return res.status(403).send('Brak uprawnień');
    }

    // Sprawdź, czy użytkownik wybrał opcję zmiany statusu
    if (changeStatus === 'TAK' && stan) {
        // Przypisanie Id_ticket
        const ticketId = Id_ticket; // Upewnij się, że zmienna ticketId jest teraz zdefiniowana

        // Najpierw znajdź odpowiednią sprawę na podstawie Id_ticket
        db.get(`
                        SELECT Sprawa.Id_sprawa FROM Sprawa JOIN Ticket ON Sprawa.Id_sprawa = Ticket.Id_sprawa WHERE Ticket.Id_ticket = ?
                        `, [ticketId], (err, row) => {
            if (err) {
                console.error("Błąd przy pobieraniu sprawy:", err.message);
                return res.status(500).send("Błąd przy pobieraniu sprawy");
            }

            if (!row) {
                return res.status(404).send('Sprawa nie znaleziona');
            }

            const sprawaId = row.Id_sprawa;

            // Teraz, po znalezieniu odpowiedniej sprawy, zaktualizujemy jej status
            db.run(`
                        UPDATE Sprawa SET Stan = ?
                        WHERE Id_sprawa = ?
                        `, [stan, sprawaId], function(err) {
                if (err) {
                    console.error("Błąd przy aktualizacji statusu sprawy:", err.message);
                    return res.status(500).send("Błąd przy aktualizacji statusu sprawy");
                }

                // Po udanej aktualizacji, wróć do widoku z aktualnymi danymi
                res.redirect(` / agent / sprawa / $ { sprawaId }
                        `);
            });
        });
    } else {
        // Jeśli nie wybrano zmiany statusu, przekieruj do widoku bez zmian
        const ticketId = Id_ticket; // TicketId jest teraz dostępne
        res.redirect(` / agent / sprawa / $ { ticketId }
                        `);
    }
});



// ładujesz certyfikaty
const options = {
    key: fs.readFileSync(path.join(__dirname, 'localhost-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'localhost.pem'))
};

// start serwera HTTPS
https.createServer(options, app).listen(3443, () => {
    console.log('✅ Serwer HTTPS działa na https://localhost:3443');
});