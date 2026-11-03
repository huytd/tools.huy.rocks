import type { Lang } from './engines'

export interface Example {
  name: string
  c4?: boolean
  code: string
}

const mermaid: Example[] = [
  {
    name: 'Flowchart',
    code: `flowchart LR
  A[Write the diagram] --> B{Looks right?}
  B -- Yes --> C[Export it]
  B -- No --> A
`,
  },
  {
    name: 'Sequence',
    code: `sequenceDiagram
  autonumber
  actor User
  participant App
  participant API
  User->>App: Click "Save"
  App->>API: PUT /documents/42
  API-->>App: 200 OK
  App-->>User: Saved
`,
  },
  {
    name: 'Class',
    code: `classDiagram
  class Shape {
    <<abstract>>
    +area() float
  }
  class Circle {
    +float radius
    +area() float
  }
  class Square {
    +float side
    +area() float
  }
  Shape <|-- Circle
  Shape <|-- Square
`,
  },
  {
    name: 'State',
    code: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Draft: request changes
  Review --> Published: approve
  Published --> [*]
`,
  },
  {
    name: 'Entity relationship',
    code: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  PRODUCT ||--o{ LINE_ITEM : "ordered in"
  CUSTOMER {
    string id PK
    string name
  }
  ORDER {
    string id PK
    string customer_id FK
    date created_at
  }
`,
  },
  {
    name: 'System context',
    c4: true,
    code: `C4Context
  title System Context diagram for Internet Banking System

  Person(customer, "Personal Banking Customer", "A customer of the bank, with personal bank accounts.")
  System(banking, "Internet Banking System", "Allows customers to view information about their bank accounts, and make payments.")

  Enterprise_Boundary(bank, "Big Bank plc") {
    System_Ext(mail, "E-mail System", "The internal Microsoft Exchange e-mail system.")
    SystemDb_Ext(mainframe, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")
  }

  Rel(customer, banking, "Views account balances, and makes payments using")
  Rel(banking, mail, "Sends e-mail using", "SMTP")
  Rel(banking, mainframe, "Gets account information from, and makes payments using")
  Rel(mail, customer, "Sends e-mails to")

  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
`,
  },
  {
    name: 'Container',
    c4: true,
    code: `C4Container
  title Container diagram for Internet Banking System

  Person(customer, "Personal Banking Customer", "A customer of the bank, with personal bank accounts.")

  Container_Boundary(banking, "Internet Banking System") {
    Container(spa, "Single-Page App", "TypeScript, React", "Provides all of the internet banking functionality to customers via their web browser.")
    Container(api, "API Application", "Java, Spring Boot", "Provides internet banking functionality via a JSON/HTTPS API.")
    ContainerDb(db, "Database", "PostgreSQL", "Stores user registration information, hashed credentials, access logs, etc.")
  }

  System_Ext(mail, "E-mail System", "The internal Microsoft Exchange e-mail system.")
  System_Ext(mainframe, "Mainframe Banking System", "Stores all of the core banking information.")

  Rel(customer, spa, "Uses", "HTTPS")
  Rel(spa, api, "Makes API calls to", "JSON/HTTPS")
  Rel(api, db, "Reads from and writes to", "SQL/TCP")
  Rel(api, mail, "Sends e-mail using", "SMTP")
  Rel(api, mainframe, "Makes API calls to", "XML/HTTPS")
  Rel(mail, customer, "Sends e-mails to")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
`,
  },
  {
    name: 'Dynamic',
    c4: true,
    code: `C4Dynamic
  title Sign-in flow for the API Application

  ContainerDb(db, "Database", "PostgreSQL", "Stores user credentials")
  Container(spa, "Single-Page App", "TypeScript, React")
  Container_Boundary(api, "API Application") {
    Component(signin, "Sign In Controller", "Spring MVC Controller", "Allows users to sign in")
    Component(security, "Security Component", "Spring Bean", "Provides sign-in and password changes")
  }

  Rel(spa, signin, "Submits credentials to", "JSON/HTTPS")
  Rel(signin, security, "Validates credentials using")
  Rel(security, db, "select * from users where username = ?", "SQL/TCP")

  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
`,
  },
]

const plantuml: Example[] = [
  {
    name: 'Sequence',
    code: `@startuml
autonumber
actor User
participant App
participant API
User -> App: Click "Save"
App -> API: PUT /documents/42
API --> App: 200 OK
App --> User: Saved
@enduml
`,
  },
  {
    name: 'Class',
    code: `@startuml
abstract class Shape {
  +area(): float
}
class Circle {
  +radius: float
  +area(): float
}
class Square {
  +side: float
  +area(): float
}
Shape <|-- Circle
Shape <|-- Square
@enduml
`,
  },
  {
    name: 'Activity',
    code: `@startuml
start
:Write the diagram;
repeat
  :Preview it;
repeat while (Looks right?) is (no)
->yes;
:Export it;
stop
@enduml
`,
  },
  {
    name: 'Use case',
    code: `@startuml
left to right direction
actor Customer
actor Clerk
rectangle Checkout {
  Customer -- (Pay)
  (Pay) .> (Print receipt) : include
  (Help) .> (Pay) : extends
  Clerk -- (Print receipt)
}
@enduml
`,
  },
  {
    name: 'System context',
    c4: true,
    code: `@startuml
!include <C4/C4_Context>

title System Context diagram for Internet Banking System

Person(customer, "Personal Banking Customer", "A customer of the bank, with personal bank accounts.")
System(banking, "Internet Banking System", "Allows customers to view information about their bank accounts, and make payments.")

Enterprise_Boundary(bank, "Big Bank plc") {
  System_Ext(mail, "E-mail System", "The internal Microsoft Exchange e-mail system.")
  System_Ext(mainframe, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")
}

Rel(customer, banking, "Views account balances, and makes payments using")
Rel_Neighbor(banking, mail, "Sends e-mail using", "SMTP")
Rel(banking, mainframe, "Gets account information from, and makes payments using")
Rel_Back(customer, mail, "Sends e-mails to")

SHOW_LEGEND()
@enduml
`,
  },
  {
    name: 'Container',
    c4: true,
    code: `@startuml
!include <C4/C4_Container>

title Container diagram for Internet Banking System

Person(customer, "Personal Banking Customer", "A customer of the bank, with personal bank accounts.")

System_Boundary(banking, "Internet Banking System") {
  Container(spa, "Single-Page App", "TypeScript, React", "Provides all of the internet banking functionality to customers via their web browser.")
  Container(api, "API Application", "Java, Spring Boot", "Provides internet banking functionality via a JSON/HTTPS API.")
  ContainerDb(db, "Database", "PostgreSQL", "Stores user registration information, hashed credentials, access logs, etc.")
}

System_Ext(mail, "E-mail System", "The internal Microsoft Exchange e-mail system.")
System_Ext(mainframe, "Mainframe Banking System", "Stores all of the core banking information.")

Rel(customer, spa, "Uses", "HTTPS")
Rel(spa, api, "Makes API calls to", "JSON/HTTPS")
Rel(api, db, "Reads from and writes to", "SQL/TCP")
Rel_Left(api, mail, "Sends e-mail using", "SMTP")
Rel_Right(api, mainframe, "Makes API calls to", "XML/HTTPS")
Rel_Back(customer, mail, "Sends e-mails to")

SHOW_LEGEND()
@enduml
`,
  },
  {
    name: 'Deployment',
    c4: true,
    code: `@startuml
!include <C4/C4_Deployment>

title Deployment diagram for Internet Banking System (live)

Deployment_Node(cloud, "Big Bank plc", "Cloud data center") {
  Deployment_Node(web, "web-server-* (x4)", "Ubuntu 24.04 LTS") {
    Deployment_Node(nginx, "nginx", "1.27") {
      Container(spa, "Single-Page App", "TypeScript, React", "Static assets for the banking app")
    }
  }
  Deployment_Node(app, "api-server-* (x8)", "Ubuntu 24.04 LTS") {
    Deployment_Node(jvm, "JVM", "OpenJDK 21") {
      Container(api, "API Application", "Java, Spring Boot", "Internet banking functionality via JSON/HTTPS")
    }
  }
  Deployment_Node(dbs, "db-*", "Ubuntu 24.04 LTS") {
    Deployment_Node(pg, "PostgreSQL", "17") {
      ContainerDb(db, "Database", "Relational schema", "Users, credentials, access logs")
    }
  }
}

Rel(spa, api, "Makes API calls to", "JSON/HTTPS")
Rel(api, db, "Reads from and writes to", "SQL/TCP")

SHOW_LEGEND()
@enduml
`,
  },
]

// In D2, a markdown label on its own makes a borderless text block, so every C4 element
// names its shape through a class.
const D2_C4_HEADER = `vars: {
  d2-config: {
    # D2's built-in C4 theme
    theme-id: 303
  }
}

classes: {
  person: {shape: c4-person}
  system: {
    shape: rectangle
    style.fill: "#1168BD"
    style.stroke: "#0B4884"
  }
  container: {shape: rectangle}
  database: {shape: cylinder}
  external: {
    shape: rectangle
    style.fill: "#999999"
    style.stroke: "#8A8A8A"
  }
  boundary: {
    style.stroke-dash: 4
    style.fill: transparent
  }
}
`

const d2: Example[] = [
  {
    name: 'Basics',
    code: `direction: right

user: User {shape: person}
app: Web app {
  ui: UI
  api: API
  ui -> api: JSON
}
db: Database {shape: cylinder}

user -> app.ui: Uses
app.api -> db: Reads and writes
`,
  },
  {
    name: 'Sequence',
    code: `shape: sequence_diagram
user: User
app: App
api: API

user -> app: Click "Save"
app -> api: PUT /documents/42
api -> app: 200 OK
app -> user: Saved
`,
  },
  {
    name: 'SQL tables',
    code: `direction: right

customers: {
  shape: sql_table
  id: uuid {constraint: primary_key}
  name: text
}
orders: {
  shape: sql_table
  id: uuid {constraint: primary_key}
  customer_id: uuid {constraint: foreign_key}
  created_at: timestamptz
}

orders.customer_id -> customers.id
`,
  },
  {
    name: 'Class',
    code: `# "shape" is a reserved word in D2, so this class gets its name from a label
base: Shape {
  shape: class
  +area(): float
}
Circle: {
  shape: class
  +radius: float
  +area(): float
}
Square: {
  shape: class
  +side: float
  +area(): float
}
Circle -> base: extends
Square -> base: extends
`,
  },
  {
    name: 'System context',
    c4: true,
    code: `${D2_C4_HEADER}
customer: |md
  ### Personal Banking Customer
  [Person]

  A customer of the bank, with personal bank accounts.
| {class: person}

banking: |md
  ### Internet Banking System
  [Software System]

  Allows customers to view information about their bank accounts, and make payments.
| {class: system}

bank: Big Bank plc {
  class: boundary

  mail: |md
    ### E-mail System
    [Software System]

    The internal Microsoft Exchange e-mail system.
  | {class: external}

  mainframe: |md
    ### Mainframe Banking System
    [Software System]

    Stores all of the core banking information about customers, accounts, transactions, etc.
  | {class: external}
}

customer -> banking: Views account balances, and makes payments using
banking -> bank.mail: "Sends e-mail using\\n[SMTP]"
banking -> bank.mainframe: Gets account information from, and makes payments using
bank.mail -> customer: Sends e-mails to
`,
  },
  {
    name: 'Container',
    c4: true,
    code: `${D2_C4_HEADER}
customer: |md
  ### Personal Banking Customer
  [Person]

  A customer of the bank, with personal bank accounts.
| {class: person}

banking: "Internet Banking System\\n[Software System]" {
  class: boundary

  spa: |md
    ### Single-Page App
    [Container: TypeScript, React]

    Provides all of the internet banking functionality to customers via their web browser.
  | {class: container}

  api: |md
    ### API Application
    [Container: Java, Spring Boot]

    Provides internet banking functionality via a JSON/HTTPS API.
  | {class: container}

  db: |md
    ### Database
    [Container: PostgreSQL]

    Stores user registration information, hashed credentials, access logs, etc.
  | {class: database}

  spa -> api: "Makes API calls to\\n[JSON/HTTPS]"
  api -> db: "Reads from and writes to\\n[SQL/TCP]"
}

mail: |md
  ### E-mail System
  [Software System]

  The internal Microsoft Exchange e-mail system.
| {class: external}

mainframe: |md
  ### Mainframe Banking System
  [Software System]

  Stores all of the core banking information.
| {class: external}

customer -> banking.spa: "Uses\\n[HTTPS]"
banking.api -> mail: "Sends e-mail using\\n[SMTP]"
banking.api -> mainframe: "Makes API calls to\\n[XML/HTTPS]"
mail -> customer: Sends e-mails to
`,
  },
]

export const EXAMPLES: Record<Lang, Example[]> = { mermaid, plantuml, d2 }

/** What a fresh session shows for each language. */
export const STARTERS: Record<Lang, string> = {
  mermaid: mermaid.find((e) => e.name === 'System context')!.code,
  plantuml: plantuml.find((e) => e.name === 'System context')!.code,
  d2: d2.find((e) => e.name === 'System context')!.code,
}
