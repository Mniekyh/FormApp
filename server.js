const express = require('express');
const session = require('express-session');
const db = require('./db');
const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Sesje
app.use(session({
    secret: 'sekretny_klucz',
    resave: false,
    saveUninitialized: true
}));

// Sprawdzenie zalogowania
const isLoggedIn = (req) => !!req.session.user;

// Strona główna
app.get('/', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/login');

    const data = {
        user: req.session.user // <-- dodajemy użytkownika
    };

    db.all('SELECT * FROM Agent', [], (err, agents) => {
        if (err) return res.status(500).send(err.message);
        data.agents = agents;

        db.all('SELECT * FROM Kategoria', [], (err, categories) => {
            if (err) return res.status(500).send(err.message);
            data.categories = categories;

            db.all('SELECT * FROM Sprawa', [], (err, sprawy) => {
                if (err) return res.status(500).send(err.message);
                data.sprawy = sprawy;

                res.render('index', data);
            });
        });
    });
});

// Rejestracja
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { imie, nazwisko, email, haslo, rola } = req.body;

    // Sprawdzenie, czy email jest już w bazie
    db.get('SELECT * FROM Uzytkownik WHERE email = ?', [email], (err, row) => {
        if (err) {
            console.error('Błąd przy sprawdzaniu istniejącego użytkownika:', err);
            return res.send('Błąd podczas rejestracji');
        }
        
        if (row) {
            return res.send('Użytkownik z tym emailem już istnieje!');
        }

        // Dodanie nowego użytkownika
        db.run('INSERT INTO Uzytkownik (imie, nazwisko, email, haslo, rola) VALUES (?, ?, ?, ?, ?)',
            [imie, nazwisko, email, haslo, rola], function (err) {
                if (err) {
                    console.error('Błąd przy dodawaniu użytkownika:', err);
                    return res.send('Błąd podczas rejestracji');
                }
                
                console.log('Nowy użytkownik zarejestrowany:', { imie, nazwisko, email, rola });
                res.redirect('/login');
            });
    });
});


// Logowanie
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM Uzytkownik WHERE email = ? AND haslo = ?', [email, password], (err, user) => {
        if (err || !user) return res.send('Nieprawidłowe dane do logowania');

        req.session.user = user;
        res.redirect('/');
    });
});

// Formularz zgłoszenia
app.get('/zgloszenie', (req, res) => {
    res.render('zgloszenie');
});

app.post('/zgloszenie', (req, res) => {
    const { Imie, Nazwisko, Adres, Telefon, Mail, Opis } = req.body;

    db.run(`INSERT INTO Sprawa 
        (Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent) 
        VALUES (?, ?, NULL, ?, ?, ?, ?, 'Oczekuje', NULL)`,
        [Imie, Nazwisko, Adres, Telefon, Mail, Opis], () => res.redirect('/zgloszenie'));
});

// CRUD Agent
app.post('/agent', (req, res) => {
    const { Imie, Nazwisko, Specjalizacja } = req.body;
    db.run('INSERT INTO Agent (Imie, Nazwisko, Specjalizacja) VALUES (?, ?, ?)', [Imie, Nazwisko, Specjalizacja], () => res.redirect('/'));
});

// CRUD Kategoria
app.post('/kategoria', (req, res) => {
    const { Nazwa } = req.body;
    db.run('INSERT INTO Kategoria (Nazwa) VALUES (?)', [Nazwa], () => res.redirect('/'));
});

// CRUD Sprawa
app.post('/sprawa', (req, res) => {
    const { Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent } = req.body;
    db.run(`INSERT INTO Sprawa 
        (Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent],
        () => res.redirect('/'));
});

app.post('/sprawa/usun/:id', (req, res) => {
    db.run('DELETE FROM Sprawa WHERE Id_sprawa = ?', [req.params.id], () => res.redirect('/'));
});

app.post('/sprawa/edytuj/:id', (req, res) => {
    const { Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent } = req.body;
    db.run(`UPDATE Sprawa SET 
        Imie = ?, Nazwisko = ?, Id_kategoria = ?, Adres = ?, Telefon = ?, Mail = ?, 
        Opis = ?, Stan = ?, Id_agent = ? WHERE Id_sprawa = ?`,
        [Imie, Nazwisko, Id_kategoria, Adres, Telefon, Mail, Opis, Stan, Id_agent, req.params.id],
        () => res.redirect('/'));
});
app.get('/sprawa/edytuj/:id', (req, res) => {
    const id = req.params.id;
    const data = {};

    db.get('SELECT * FROM Sprawa WHERE Id_sprawa = ?', [id], (err, sprawa) => {
        if (err || !sprawa) return res.status(404).send("Nie znaleziono sprawy");
        data.sprawa = sprawa;

        db.all('SELECT * FROM Agent', [], (err, agents) => {
            if (err) return res.status(500).send(err.message);
            data.agents = agents;

            db.all('SELECT * FROM Kategoria', [], (err, categories) => {
                if (err) return res.status(500).send(err.message);
                data.categories = categories;

                res.render('edytuj', data); // <- renderuje formularz
            });
        });
    });
});

// === Wylogowanie ===
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Błąd przy wylogowaniu:', err);
        }
        res.redirect('/login');
    });
});

// Start serwera
app.listen(port, () => {
    console.log(`Serwer działa na http://localhost:${port}`);
});
