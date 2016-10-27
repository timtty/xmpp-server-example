/**
 * Created by tim on 10/18/16.
 */

var XmppServer = require("node-xmpp-server");
var Stanza = require("node-xmpp-core").Stanza;
var Pem = require("pem");

var XmppConnections = {};
var Statuses = {};

function ClientHandler(Client) {
    var connectionId;
    var jid;

    Client.on("register", function(opts, cb) {
        /** for if clients send a register */
        cb(false);
    });

    Client.on("authenticate", function(opts, cb) {
        if (opts.username == "admin" && opts.password == "admin") {
            cb(null, opts);
        } else {
            cb(false);
        }
    });

    Client.on("online", function() {
        connectionId = Client.jid.toString();

        if (connectionId.indexOf("/") != -1) {
            connectionId.substring(0, connectionId.indexOf("/"));
        }

        connectionId.replace("@", "__");

        jid = Client.jid.user;

        XmppConnections[connectionId] = Client;

        Statuses[jid] = {
            jid: Client.jid.user+"@nodexmpp",
            show: "chat",
            status: "Available"
        };

        console.log(jid+" is online.");
    });

    Client.on("disconnect", function() {
        Statuses[jid] = {
            jid: Client.jid.user+"@nodexmpp",
            show: "dead",
            status: "Disconnected"
        };

        console.log(jid+" has disconnected.");
    });

    Client.on("stanza", function(S) {
        if (S.is("iq")) {
            var id = S.attrs.id;
            var q;
            var response;

            if (S.attrs.type == "get") {
                if (S.getChild("query")) {
                    q = S.getChild("query");

                    if (q.attrs.xmlns == "jabber:iq:roster") {
                        // ROSTER
                    } else if (q.attrs.xmlns == "jabber:iq:privacy") {
                        // client happiness
                        response = new Stanza("iq", {type: "result", id: id, to: Client.jid});
                        Client.send(response);
                    } else if (q.attrs.xmlns.indexOf("http://jabber.org/protocol/disco") != -1) {
                        // client happiness
                        response = new Stanza("iq", {
                            id: id,
                            type: "result",
                            to: S.attrs.from,
                            from: S.attrs.to
                        });
                        response.c("query", {xmlns: q.attrs.xmlns});
                        Client.send(response);
                    } else if (q.getChild("storage")) {
                        // optional
                    }
                } else if (S.getChild("pubsub")) {
                    // client happiness
                    response = new Stanza("iq", {
                        id: id,
                        type: "result",
                        to: Client.jid})
                        .c("pubsub")
                        .c("items")
                        .up();
                    Client.send(response);
                } else if (S.getChild("ping")) {
                    // client happiness
                    response = new Stanza("iq", {
                        id: id,
                        type: "result",
                        to: Client.jid
                    });
                    Client.send(response);
                }
            } else if (S.attrs.type == "set") {
                if (S.getChild("query")) {
                    q = S.getChild("query");

                    if (q.attrs.xmlns == "jabber:iq:roster") {
                        if (q.getChild("item")) {
                            var item = q.getChild("item");

                            // Rosters for users are maintained on the server side
                            // Roster changes are updated on the client after the server pushes a roster update stanza (not shown)
                            if ((item.attrs.subscription != "remove") && item.attrs.jid) {
                                // This should be an add to roster event
                                Client.send(new Stanza("iq", {id: id, type: "result"}));
                            } else {
                                // This should be a remove from roster event
                                Client.send(new Stanza("iq", {id: id, type: "result"}));
                            }
                        }
                    } else if (q.attrs.xmlns == "jabber:iq:privacy") {
                        response = new Stanza("iq", {
                            id: id,
                            type: "result",
                            to: Client.jid
                        });
                        Client.send(response);
                    }
                }
            }
        } else if (S.is("presence")) {
            if (S.attrs.from) {
                var show = "chat";
                var status = "Available";

                if (S.getChild("show") != undefined) {
                    show = S.getChild("show").getText();
                }

                if (S.getChild("status") != undefined) {
                    status = S.getChild("status").getText();
                }

                // update your roster cache or w/e
            }
        } else if (S.is("message")) {
            if (S.attrs.type == "chat" && S.getChild("body")) {
                var from = S.attrs.from;
                var to = S.attrs.to;
                var toConnId = from;

                if (to.indexOf("/") != -1) {
                    to = to.substring(0, to.indexOf("/"));
                }

                if (from.indexOf("/") != -1) {
                    from = from.substring(0, from.indexOf("/"));
                }

                S.attr("to", to);
                S.attr("from", from);


                toConnId = toConnId.replace("@", "_");

                console.log("Send "+toConnId);

                if (XmppConnections[toConnId]) {
                    XmppConnections[toConnId].send(S);
                }
            }
        }

        // dump the xml stanza for debugging
        console.log(S.root().toString());
    });

}


Pem.createCertificate({
    days: 100,
    selfSigned: true
}, function(err, keys) {
    if (err) {
        console.log("Key gen err");
        process.exit(13);
    }

    var Server = new XmppServer.C2S.TCPServer({
        port: 5222,
        tls: {
            key: keys.serviceKey,
            cert: keys.certificate
        }
    });

    Server.on("connection", ClientHandler);

    Server.on("listening", function ListenNotify() {
        console.log("Xmpp server is listening...");
    });
});