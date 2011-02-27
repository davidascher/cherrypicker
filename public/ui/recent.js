/***************************** BEGIN LICENSE BLOCK *****************************
* Version: MPL 1.1/GPL 2.0/LGPL 2.1
*
* The contents of this file are subject to the Mozilla Public License Version
* 1.1 (the "License"); you may not use this file except in compliance with the
* License. You may obtain a copy of the License at http://www.mozilla.org/MPL/
*
* Software distributed under the License is distributed on an "AS IS" basis,
* WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for
* the specific language governing rights and limitations under the License.
*
* The Original Code is Thunderbird Jetpack Functionality.
*
* The Initial Developer of the Original Code is the Mozilla Foundation.
* Portions created by the Initial Developer are Copyright (C) 2009 the Initial
* Developer. All Rights Reserved.
*
* Contributor(s):
*  Andrew Sutherland <asutherland@asutherland.org> (Original Author)
*
* Alternatively, the contents of this file may be used under the terms of either
* the GNU General Public License Version 2 or later (the "GPL"), or the GNU
* Lesser General Public License Version 2.1 or later (the "LGPL"), in which case
* the provisions of the GPL or the LGPL are applicable instead of those above.
* If you wish to allow use of your version of this file only under the terms of
* either the GPL or the LGPL, and not to allow others to use your version of
* this file under the terms of the MPL, indicate your decision by deleting the
* provisions above and replace them with the notice and other provisions
* required by the GPL or the LGPL. If you do not delete the provisions above, a
* recipient may use your version of this file under the terms of any one of the
* MPL, the GPL or the LGPL.
*
****************************** END LICENSE BLOCK ******************************/

define(
  [
    "wmsy/wmsy",
    "exports",
  ],
  function(
    wmsy,
    exports
  ) {

var wy = new wmsy.WmsyDomain({id: "conversation",
                              domain: "conversation",
                              clickToFocus: true});

wy.defineStyleBase("messages", [
  ".message (@color: #000) {",
    "color: #888;",
  "}",
]);

function Conversation(participants, topic, unreadCount, totalCount, date, star, messages) {
  this.participants = participants;
  this.topic = topic;
  this.unreadCount = unreadCount;
  this.totalCount = totalCount;
  this.date = date;
  this.star = star;
  this.messages = messages;
};

function Identity(aName, aEmail, aInAddressBook) {
  this.name = aName || aEmail;
  this.email = aEmail;
  this.inAddressBook = aInAddressBook;
};

function EmailMessage(aFrom, aTo, aBody) {
  this.from = aFrom;
  this.to = aTo;
  this.body = aBody;
  if (aBody.indexOf('<a') != -1) {
    this.bodyType = 'html';
  }
}
EmailMessage.prototype = {
  messageType: "rfc822",
};


var idMap = {};

function getId(blob) {
  name = blob['name'];
  email = blob['email'];
  var id = idMap[email];
  if (id && ! id.name) {
    id.name = name;
  }
  if (id) return id;
  id = new Identity(name, email);
  idMap[email] = id;
  return id;
}

/**
 * General identity representation.
 */
wy.defineWidget({
  name: "identity-default",
  constraint: {
    type: "identity",
  },
  structure: wy.flow({
    name: wy.bind("name"),
    star: wy.bind(wy.NONE, {starred: "inAddressBook"})
  }),
  style: {
    root: [
      "display: inline-block;",
      "color: #2EA4FF;",
      "font-weight: bold;",
      "padding-right: 5px;",
      "margin-right: 5px;",
    ],
  }
});

hoverStyle = [
  "border-bottom: 1px solid #BFD5DE;",
  "border-top: 1px solid #BFD5DE;",
  "z-index: 100;",
  "position: relative;",
  "background-image: -moz-linear-gradient(top, #EDF2F5 0%, #E6EDF0 100%);",
  "background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0%, #EDF2F5), color-stop(100%, #E6EDF0));",
];

wy.defineStyleBase("conversation", [
".hbox() {",
  "display: -webkit-box;",
  "font-size: huge;",
  "-webkit-box-orient: horizontal;",
  "-webkit-box-align: stretch;",
 
  "display: -moz-box;",
  "-moz-box-orient: horizontal;",
  "-moz-box-align: stretch;",
 
  "display: box;",
  "box-orient: horizontal;",
  "box-align: stretch;",
  "width: 100%;",
  "}",
 
".boxFlex() {",
  "-webkit-box-flex: 1;",
  "-moz-box-flex: 1;",
  "box-flex: 1;",
"}",

".boxFlex0() {",
"  -webkit-box-flex: 0;",
"  -moz-box-flex: 0;",
"  box-flex: 0;",
"}"
]);

wy.defineWidget({
  name: "conversation",
  constraint: {
    type: "conversation",
  },
  focus: wy.focus.item,
  structure: {
    headerBlock: wy.flow({
      participants: wy.horizList({type: "identity"}, "participants"),
      metaBlock: wy.flow({
        unreadCount: wy.bind("unreadCount"),
        date: wy.bind('date'),
        //star: wy.bind('star'),  // HOW TO MAP BOOLEAN TO CHECKBOX?
      }),
    }),
    topicBlock: wy.bind("topic"),
  },
  style: {
    root: {
      _: [
          "background-color: #fff;",
          "padding: 10px;",
          "border-bottom: 1px solid #e6e6e6;",
          "border-top: 1px solid #e6e6e6;",
          "margin-top: -1px;",
          "cursor: pointer;",
          "color: #888;",
          "background-image: -moz-linear-gradient(top, #fff 0%, #fafafa 100%);",
          "background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0%, #fff), color-stop(100%, #fafafa));",
      ],
      ":hover": {
        _: hoverStyle,
      },
      ":focused": {
        _: hoverStyle,
      },
    },
    headerBlock: [
      ".hbox();",
    ],
    metaBlock: [
      ".boxFlex0();",
      "display: block;"
    ],
    participants: [
      ".boxFlex();",
      "display: block;"
    ],
    topic: [
      "font-weight: bold;"
    ],
    unreadCount: [
      "background-color: #888888;",
      "border-radius: 2px 2px 2px 2px;",
      "color: #FFFFFF;",
      "font-weight: bold;",
      "margin: 0 3px;",
      "padding: 0 5px;",
    ],
    time: "margin: 0 5px 0 0;",
  },
  impl: {
    postInitUpdate: function() {
      s = this.date_element.textContent;
      this.date_element.textContent = $.prettyDate.format(new Date(Date.parse(s)));
    }
  },
  receive: {
    focusChanged: function(aFocusedBinding, aFocusedDomain) {
      //console.log(aFocusedBinding, aFocusedDomain);
      loadConversation(aFocusedBinding.obj);
    },
  }
});

            //<div class="messageBody">
            //    <div class="messageBodyHeader hbox">
            //        <div class="boxFlex">
            //            <span class="from">Bryan Clark</span> 
            //            <span class="to">to Andy Chung</span>
            //        </div>
            //        <div>
            //            <span class="date">Oct 7</span>
            //        </div>
            //    </div>
            //    <p>Hey Andy</p>
            //    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec cursus consequat ante ut viverra. Integer turpis libero, fringilla at bibendum sed, elementum ut diam. Cras dignissim turpis nec lorem placerat pellentesque. Nam enim risus, suscipit id volutpat fermentum, venenatis et torto</p>
            //    <div class="messageBodyFooter hbox">
            //        <div class="boxFlex">
            //            <button>reply</button>
            //            <button>forward</button>
            //        </div>
            //    </div>
            //</div>
    //
    //    .message .messageBody .messageBodyHeader {
    //        padding: 25px 0 10px;
    //    }
    //    
    //    .message .messageBody p {
    //        color: #444444;
    //        margin-bottom: 21px;
    //    }

/**
 * General message display widget.
 */
wy.defineWidget({
  name: "message-default",
  constraint: {
    type: "message",
  },
  focus: wy.focus.item,
  structure: {
    fromBlock: wy.flow({
      from: wy.widget({type: "identity"}, "from"),
    }),
    toBlock: wy.flow({
      to: wy.widgetFlow({type: "identity"}, "to", {separator: ", "}),
    }),
    bodyBlock: wy.subWidget({
      type: "body"
    }),
  },
  style: {
    root: [
      "background-color: #FFFFFF;",
      "border: 1px solid #DDDDDD;",
      "border-radius: 3px 3px 3px 3px;",
      "box-shadow: 1px 1px 0 #FFFFFF;",
      "padding: 0 25px 25px;",
    ],
    subject: [
      "font-weight: bold;"
    ],
    fromBlock: "font-weight: bold;",
    toBlock: "color: #888;",
  },
});

wy.defineWidget({
  name: "message-body",
  constraint: {
    type: "body"
  },
  structure: {
    body: wy.bind("body")
  },
  style: {
    root: [
      "background-color: #ffffff;",
      "white-space: pre-wrap;"
      ]
  },
})

/**
 * HTML-specialized body
 */

wy.defineWidget({
  name: "message-body-html",
  constraint: {
    type: "body",
    obj: {
      bodyType: "html"
    }
  },
  structure: {
  },
  style: {
    root: [
      "margin: 2px;",
      "padding: 2px;",
      "border-radius: 2px;",
      "background-color: #ffffff;",
      "white-space: normal;"
      ]
  },
  impl: {
    postInitUpdate: function() {
      this.domNode.innerHTML = this.obj.body;
    }
  }
});

wy.defineStyleBase("messagelist", [
  ".subject () {",
"        font-size: 16px;",
"        padding: 5px 0;",
"        width: 100%;",
  "}",
]);

wy.defineWidget({
  name: "messagelist",
  focus: wy.focus.domain.vertical("messages"),
  constraint: {
    type: "messagelist",
  },
  //<div class="title hbox">
  //    <div class="subject overflow boxFlex">
  //        Lunch tomorrow
  //    </div>
  //    <div class="tags">
  //        <span>inbox</span>  XXX TODO
  //    </div>
  //    <span class="starred">&#x2605;</span>
  //</div>
  structure: {
    titleBlock: {
      subject: wy.bind("topic"),
      tags: wy.bind("tags"),
      starred: wy.bind(wy.NONE, {starred: "starred"}),
    },
    messages: wy.vertList({type: "message"}, "messages"),
  },
  style: {
    title: "padding: 5px 0;",
    subject: [
      ".hbox();",
      ".subject();"
    ],
    starred: "display: none;", // for now
    tags: "display: none;", // for now
  },
})

wy.defineWidget({
  name: "root",
  focus: wy.focus.domain.vertical("conversations"),
  doc: "Root display widget; everything hangs off this.",
  constraint: {
    type: "root",
  },
  //impl: {
  //  __scrollingDomNode: "root",
  //},
  structure: {
    conversations: wy.vertList({type: "conversation"}, "conversations"),
  },
});

function wrapMsg(blob) {
  var from = getId(blob['from']);
  var to = blob['to'].map(getId);
  var m = new EmailMessage(
    from,
    to,
    blob['body']
  );
  return m;
}

function loadConversation(conversation) {
  var list = document.getElementById("messagelist");
  list.textContent = "";
  var emitter = wy.wrapElement(list);
  var msgs = [];
  var blobs = conversation['messages'];
  for (i =0; i<blobs.length; i++) {
    msgs.push(wrapMsg(blobs[i]));
  }
  var messagelistObj = {
    messages: msgs,
    topic: conversation.topic,
    starred: false,
    tags: "inbox",
  };
  
  emitter.emit({type: "messagelist", obj: messagelistObj});

};

exports.main = function main(baseRelPath, doc) {
  // need to know where to find our star!
  wy.setPackageBaseRelPath(baseRelPath);

  var emitter = wy.wrapElement(doc.getElementById("content"));
  
  $.ajax({
    url: '/recent_convos/test@ascher.ca',
    dataType: 'json',
    success: function(data) {
      var conversations = [];
      for (var i=data.length-1; conversations.length < 30 && i > -1; i--) {
        var blob = data[i];

        var convo = new Conversation(blob['participants'],
                                     blob['topic'],
                                     blob['unreadCount'],
                                     blob['totalCount'],
                                     blob['date'],
                                     blob['star'],
                                     blob['messages']);
        conversations.push(convo);
      }
      var rootObj = {
        conversations: conversations,
      };

      emitter.emit({type: "root", obj: rootObj});
    },
    error: function(){
      $('#output').html('error');;
    }
  });

};

}); // end define
