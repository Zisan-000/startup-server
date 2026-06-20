require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.tfpkery.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const logger = (req, res, next) => {
  next();
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("startup");
    const startupCollection = database.collection("startups");
    const opportunityCollection = database.collection("opportunities");
    const usersCollection = database.collection("user");
    const applicationsCollection = database.collection("applications");
    const paymentsCollection = database.collection("payments");
    const sessionCollection = database.collection("session");

    // verfication middleware
    const verifyToken = async (req, res, next) => {
      // console.log("headers", req.headers);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      const token = req.headers.authorization.split(" ")[1];

      if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      const query = { token: token };
      const session = await sessionCollection.findOne(query);

      if (!session) {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      const userId = session.userId;

      const userQuery = { _id: userId };
      const user = await usersCollection.findOne(userQuery);

      if (!user) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      req.user = user;
      next();
    };

    const verifyCollaborator = async (req, res, next) => {
      if (req.user?.role !== "collaborator") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    const verifyFounder = async (req, res, next) => {
      if (req.user?.role !== "founder") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // user
    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
      const cursor = usersCollection.find().skip(1);
      const users = await cursor.toArray();
      res.send(users);
    });

    app.get("/api/users/profile", verifyToken, async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res
            .status(400)
            .json({ error: "Email parameter is required." });
        }

        const userDoc = await usersCollection.findOne({ email: email });

        if (!userDoc) {
          return res
            .status(404)
            .json({ error: "User profile document not found." });
        }

        res.json(userDoc);
      } catch (error) {
        console.error("Failed fetching user profile:", error);
        res.status(500).json({ error: "Internal server error." });
      }
    });

    app.patch(
      "/api/users/:id/block",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { isBlocked } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              error: "Invalid target user profile hex reference payload.",
            });
          }

          const filter = { _id: new ObjectId(id) };
          const updateDocument = {
            $set: { isBlocked: isBlocked },
          };

          const result = await usersCollection.updateOne(
            filter,
            updateDocument,
          );
          res.json(result);
        } catch (error) {
          console.error(
            "Backend error altering account block status properties:",
            error,
          );
          res
            .status(500)
            .json({ error: "Internal administrative control server fault." });
        }
      },
    );

    app.patch("/api/users/profile/update", verifyToken, async (req, res) => {
      try {
        const { email } = req.query;
        const { name, image, bio, skills } = req.body;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query reference criteria required." });
        }

        const filter = { email: email };
        const updateDocument = {
          $set: {
            name: name,
            image: image,
            bio: bio,
            skills: skills, // Injects the parsed array clean string tags
            updatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(filter, updateDocument);

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ error: "User account schema target missing." });
        }

        res.json({ success: true, result });
      } catch (error) {
        console.error("Failed executing user schema update sequence:", error);
        res.status(500).json({
          error:
            "Internal compilation failure during database save operations.",
        });
      }
    });

    // startups

    app.get("/api/startups", async (req, res) => {
      const cursor = startupCollection.find();
      const startups = await cursor.toArray();
      res.send(startups);
    });

    app.get("/api/my/startups", verifyToken, async (req, res) => {
      const query = {};
      if (req.query.startupId) {
        query.startupId = req.query.startupId;
      }
      if (req.query.status) {
        query.status = req.query.status;
      }
      const result = await startupCollection.find(query).toArray();
      //   const startups = await cursor.toArray();
      res.send(result || []);
    });

    app.post("/api/startups", verifyToken, async (req, res) => {
      const startup = req.body;
      const result = await startupCollection.insertOne(startup);
      res.json(result);
    });

    app.patch("/api/startups/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedStartup = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDocument = {
        $set: {
          status: updatedStartup.status,
        },
      };
      const result = await startupCollection.updateOne(filter, updateDocument);
      res.json(result);
    });

    app.patch("/api/startupsinfo/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const filter = { startupId: id };

      const updateDocument = {
        $set: {
          name: updatedData.name,
          industry: updatedData.industry,
          fundingStage: updatedData.fundingStage,
          description: updatedData.description,
          ...(updatedData.status && { status: updatedData.status }),
        },
      };

      const result = await startupCollection.updateOne(filter, updateDocument);

      res.json(result);
    });

    app.delete("/api/startupsinfo/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { ObjectId } = require("mongodb");

        // Filter matches either the custom string tracker OR the database ObjectId wrapper safely
        const filter = {
          $or: [
            { startupId: id },
            { _id: ObjectId.isValid(id) ? new ObjectId(id) : null },
          ],
        };

        const result = await startupCollection.deleteOne(filter);
        res.json(result);
      } catch (error) {
        console.error("Failed to delete startup document:", error);
        res.status(500).json({ error: "Internal server deletion error" });
      }
    });

    // opportunities

    app.get("/api/my/opportunities", verifyToken, async (req, res) => {
      try {
        const query = {};

        if (req.query.startup_id) {
          query.startup_id = req.query.startup_id;
        }

        const result = await opportunityCollection.find(query).toArray();
        res.send(result || []);
      } catch (error) {
        console.error("Failed to fetch user opportunities:", error);
        res.status(500).send([]);
      }
    });

    app.get("/api/opportunities", async (req, res) => {
      try {
        const { search, workType, industry, page, perPage } = req.query;
        const pipeline = [];

        // 1. Convert the string startup_id field into an ObjectId type dynamically
        pipeline.push({
          $addFields: {
            startupObjectId: { $toObjectId: "$startup_id" },
          },
        });

        // 2. Perform the lookup join using the converted ObjectId field
        pipeline.push({
          $lookup: {
            from: "startups",
            localField: "startupObjectId",
            foreignField: "_id",
            as: "startup_info",
          },
        });

        // 3. Flatten the joined array into a single root object matching field paths
        pipeline.push({
          $unwind: {
            path: "$startup_info",
            preserveNullAndEmptyArrays: true,
          },
        });

        // 4. Build the filter match query object
        const matchQuery = {};

        if (search) {
          matchQuery.$or = [
            { role_title: { $regex: search, $options: "i" } },
            { required_skills: { $regex: search, $options: "i" } },
          ];
        }

        if (workType) {
          matchQuery.work_type = { $in: workType.split(",") };
        }

        if (industry) {
          matchQuery["startup_info.industry"] = { $in: industry.split(",") };
        }

        // Apply the conditional matches if filters were selected
        if (Object.keys(matchQuery).length > 0) {
          pipeline.push({ $match: matchQuery });
        }

        // --- NEW: PAGINATION IMPLEMENTATION ---
        const currentPage = parseInt(page) || 1;
        const limit = parseInt(perPage) || 12;
        const skip = (currentPage - 1) * limit;

        // Use $facet to execute two parallel pipelines: one for data, one for the total count
        pipeline.push({
          $facet: {
            metadata: [{ $count: "total" }],
            data: [{ $skip: skip }, { $limit: limit }],
          },
        });

        const result = await opportunityCollection
          .aggregate(pipeline)
          .toArray();

        // Extract the separated data from the facet result
        const items = result[0]?.data || [];
        const totalCount = result[0]?.metadata[0]?.total || 0;

        res.send({
          opportunities: items,
          total: totalCount,
          page: currentPage,
          totalPages: Math.ceil(totalCount / limit),
        });
      } catch (error) {
        console.error("Aggregation lookup failed:", error);
        res
          .status(500)
          .send({ message: "Server filtering aggregation error", error });
      }
    });

    app.get("/api/opportunities/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await opportunityCollection.findOne(query);
      res.send(result);
    });

    app.post("/api/opportunities", verifyToken, async (req, res) => {
      const opportunity = req.body;
      const result = await opportunityCollection.insertOne(opportunity);
      res.json(result);
    });

    app.patch(
      "/api/opportunitiesinfo/:id",
      verifyToken,
      verifyFounder,
      async (req, res) => {
        try {
          const id = req.params.id;
          const data = req.body;

          if (!ObjectId.isValid(id)) {
            return res
              .status(400)
              .json({ error: "Invalid Opportunity ID format." });
          }
          const filter = { _id: new ObjectId(id) };

          const updateDocument = {
            $set: {
              role_title: data.role_title,
              work_type: data.work_type,
              commitment_level: data.commitment_level,
              required_skills: data.required_skills,
              deadline: data.deadline,
            },
          };

          const result = await opportunityCollection.updateOne(
            filter,
            updateDocument,
          );
          res.json(result);
        } catch (error) {
          console.error("Failed to update opportunity details:", error);
          res.status(500).json({ error: "Internal server update error" });
        }
      },
    );

    app.delete(
      "/api/opportunitiesinfo/:id",
      verifyToken,
      verifyFounder,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id };
        const result = await opportunityCollection.deleteOne(filter);
        res.json(result);
      },
    );

    // applications

    app.get("/api/applications", verifyToken, async (req, res) => {
      const query = {};
      if (req.query.applicantEmail) {
        query.applicantEmail = req.query.applicantEmail;

        if (req.user.email !== req.query.applicantEmail) {
          return res.status(403).send({ message: "Forbidden access" });
        }
      }
      if (req.query.opportunityId) {
        query.opportunityId = req.query.opportunityId;
      }
      const cursor = applicationsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/my-applications", verifyToken, async (req, res) => {
      try {
        const { email } = req.query;
        if (!email)
          return res.status(400).send({ message: "Email parameter required" });

        const pipeline = [
          // 1. Filter applications belonging strictly to this applicant email
          { $match: { applicantEmail: email } },

          // 2. Convert string opportunityId to ObjectId for the first join
          {
            $addFields: {
              oppObjectId: { $toObjectId: "$opportunityId" },
            },
          },

          // 3. Join with the opportunities collection
          {
            $lookup: {
              from: "opportunities",
              localField: "oppObjectId",
              foreignField: "_id",
              as: "opportunity_info",
            },
          },
          {
            $unwind: {
              path: "$opportunity_info",
              preserveNullAndEmptyArrays: true,
            },
          },

          // 4. Convert the nested startup_id string from the opportunity into an ObjectId
          {
            $addFields: {
              startupObjectId: { $toObjectId: "$opportunity_info.startup_id" },
            },
          },

          // 5. Join with the startups collection to get the startup metadata
          {
            $lookup: {
              from: "startups",
              localField: "startupObjectId",
              foreignField: "_id",
              as: "startup_info",
            },
          },
          {
            $unwind: {
              path: "$startup_info",
              preserveNullAndEmptyArrays: true,
            },
          },

          // 6. Project clean, flattened fields directly for easier frontend mapping
          {
            $project: {
              _id: 1,
              opportunityTitle: 1,
              status: 1,
              applied_at: 1,
              portfolioLink: 1,
              motivationMessage: 1,
              // FIX: Evaluates 'name' first, if null checks 'startup_name', if both null defaults to fallback string
              startupName: {
                $ifNull: [
                  "$startup_info.name",
                  "$startup_info.startup_name",
                  "Unknown Startup",
                ],
              },
            },
          },

          // Sort by newest applications first
          { $sort: { applied_at: -1 } },
        ];

        const result = await applicationsCollection
          .aggregate(pipeline)
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Failed fetching aggregate applicant records:", error);
        res.status(500).send([]);
      }
    });

    app.get("/api/founder-applications", verifyToken, async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res
            .status(400)
            .json({ error: "Founder email parameter required" });
        }

        // 1. Find the startup profile linked to this founder email
        const startup = await startupCollection.findOne({
          founderEmail: email,
        });
        if (!startup) {
          return res.json([]);
        }

        // Get the company matching ID string
        const companyId = startup.startupId || startup._id?.toString();

        // 2. Find all opportunities created by this startup company profile
        const opportunities = await opportunityCollection
          .find({ startup_id: companyId })
          .toArray();

        if (!opportunities.length) {
          return res.json([]);
        }

        // Extract all corresponding job hex strings
        const opportunityIds = opportunities.map(
          (opp) => opp._id?.toString() || opp.id,
        );

        // 3. Retrieve all incoming user application forms matching those job tokens
        const applications = await applicationsCollection
          .find({ opportunityId: { $in: opportunityIds } })
          .sort({ _id: -1 })
          .toArray();

        res.json(applications);
      } catch (error) {
        console.error("Failed querying applications by founder email:", error);
        // FIX: Always return valid JSON structure so JSON.parse never crashes
        res.status(500).json([]);
      }
    });

    app.post("/api/applications", verifyToken, async (req, res) => {
      const application = req.body;
      const newApplication = {
        ...application,
        applied_at: new Date(),
      };
      const result = await applicationsCollection.insertOne(newApplication);
      res.send(result);
    });

    app.patch(
      "/api/applications/:id",
      verifyToken,
      verifyFounder,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { status } = req.body; // Safely destructure the status string property

          if (!ObjectId.isValid(id)) {
            return res
              .status(400)
              .json({ error: "Invalid document target identity hex format" });
          }

          const filter = { _id: new ObjectId(id) };
          const updateDocument = {
            $set: {
              status: status,
            },
          };

          const result = await applicationsCollection.updateOne(
            filter,
            updateDocument,
          );

          // Send a predictable JSON structure back
          res.json(result);
        } catch (error) {
          console.error("Express application patching failed:", error);
          res.status(500).json({ error: "Internal update routine crash" });
        }
      },
    );

    // payments

    app.get("/api/payments", verifyToken, verifyAdmin, async (req, res) => {
      const cursor = paymentsCollection.find();
      const payments = await cursor.toArray();
      res.send(payments);
    });

    app.post("/api/payments", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await paymentsCollection.insertOne(data);

      const filter = { email: data.user_email };

      const updateDocument = {
        $set: {
          plan: data.planId,
        },
      };
      const updateResult = await usersCollection.updateOne(
        filter,
        updateDocument,
      );
      res.send(updateResult);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  //   console.log(`Example app listening on port ${port}`);
});
